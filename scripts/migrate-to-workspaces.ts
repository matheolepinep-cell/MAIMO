/**
 * Migration script: assign all existing data to the "Principal" workspace.
 *
 * For each company:
 *   1. Find (or create) the default workspace "Principal"
 *   2. Assign all accounts, notes, documents, conversations, notifications
 *      that have workspace_id = NULL to that workspace
 *   3. Add all active users of the company as workspace members (role: member)
 *      — existing admin users become workspace admin
 *
 * Run once after deploying the create_workspaces.sql migration.
 * Usage:
 *   npx tsx scripts/migrate-to-workspaces.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migrate() {
  console.log('Starting workspace migration...\n')

  // 1. Load all companies
  const { data: companies, error: compErr } = await supabase.from('companies').select('id, name')
  if (compErr || !companies) { console.error('Failed to load companies:', compErr); process.exit(1) }

  console.log(`Found ${companies.length} company(ies)\n`)

  for (const company of companies) {
    console.log(`── Company: ${company.name} (${company.id})`)

    // 2. Find or create default workspace
    let wsId: string

    const { data: existing } = await supabase
      .from('workspaces')
      .select('id')
      .eq('company_id', company.id)
      .eq('is_default', true)
      .maybeSingle()

    if (existing) {
      wsId = existing.id
      console.log(`   ✓ Found default workspace: ${wsId}`)
    } else {
      // Find admin user to set as creator
      const { data: adminUser } = await supabase
        .from('users')
        .select('id')
        .eq('company_id', company.id)
        .eq('role', 'admin')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .insert({
          company_id: company.id,
          name: 'Principal',
          color: '1E2761',
          is_default: true,
          created_by: adminUser?.id ?? null,
        })
        .select('id')
        .single()

      if (wsErr || !ws) { console.error(`   ✗ Failed to create workspace:`, wsErr); continue }
      wsId = ws.id
      console.log(`   ✓ Created default workspace: ${wsId}`)
    }

    // 3. Assign unassigned data to this workspace
    const tables: string[] = ['accounts', 'notes', 'documents', 'conversations', 'notifications', 'portfolio']

    for (const table of tables) {
      const { error, count } = await supabase
        .from(table)
        .update({ workspace_id: wsId })
        .eq('company_id', company.id)
        .is('workspace_id', null)
        .select('id', { count: 'exact', head: true })

      if (error) {
        console.error(`   ✗ Failed to update ${table}:`, error.message)
      } else {
        console.log(`   ✓ Updated ${table}: ${count ?? 0} row(s) assigned`)
      }
    }

    // 4. Add all active users as workspace members
    const { data: users } = await supabase
      .from('users')
      .select('id, role')
      .eq('company_id', company.id)
      .eq('is_active', true)

    if (users && users.length > 0) {
      const memberRows = users.map((u: { id: string; role: string }) => ({
        workspace_id: wsId,
        user_id: u.id,
        role: u.role === 'admin' ? 'admin' : 'member',
      }))

      const { error: memErr } = await supabase
        .from('workspace_members')
        .upsert(memberRows, { onConflict: 'workspace_id,user_id' })

      if (memErr) {
        console.error(`   ✗ Failed to add workspace members:`, memErr.message)
      } else {
        console.log(`   ✓ Added/updated ${memberRows.length} workspace member(s)`)
      }
    }

    console.log()
  }

  console.log('Migration complete.')
}

migrate().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})

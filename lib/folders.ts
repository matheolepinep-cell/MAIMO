import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Ensures a root-level account folder exists in the global Documents page.
 * Idempotent: returns existing folder id if already present.
 * workspace_id is required — account folders are workspace-scoped.
 */
export async function ensureAccountFolder(
  accountId: string,
  workspaceId: string,
  companyId: string,
): Promise<string | null> {
  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)

  const { data: existing } = await supabase
    .from('folders')
    .select('id')
    .eq('folder_type', 'account')
    .eq('account_id', accountId)
    .eq('workspace_id', workspaceId)
    .is('parent_id', null)
    .maybeSingle()

  if (existing) return existing.id

  const { data: account } = await supabase
    .from('accounts')
    .select('name')
    .eq('id', accountId)
    .single()

  if (!account) return null

  const { data: newFolder } = await supabase
    .from('folders')
    .insert({
      name: account.name,
      folder_type: 'account',
      parent_id: null,
      account_id: accountId,
      workspace_id: workspaceId,
      company_id: companyId,
    })
    .select('id')
    .single()

  return newFolder?.id ?? null
}

import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

function adminClient() {
  return createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)
}

// GET /api/folders?account_id=&parent_id=
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const parentId = searchParams.get('parent_id') // null means root

  const supabase = adminClient()

  let query = supabase
    .from('folders')
    .select('id, name, parent_id, account_id, created_at, created_by')
    .eq('company_id', user.company_id)
    .order('name')

  if (accountId) query = query.eq('account_id', accountId)
  if (parentId) {
    query = query.eq('parent_id', parentId)
  } else {
    query = query.is('parent_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ folders: data ?? [] })
}

// POST /api/folders — create folder
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, account_id, parent_id, workspace_id, folder_type } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = adminClient()

  const payload: Record<string, unknown> = {
    company_id: user.company_id,
    name: name.trim(),
    account_id: account_id ?? null,
    parent_id: parent_id ?? null,
    workspace_id: workspace_id ?? null,
    folder_type: folder_type ?? 'custom',
    created_by: user.id,
  }

  const { data, error } = await supabase.from('folders').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ folder: data }, { status: 201 })
}

// PATCH /api/folders — rename folder
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name } = await request.json()
  if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name required' }, { status: 400 })

  const supabase = adminClient()

  const { data, error } = await supabase
    .from('folders')
    .update({ name: name.trim() })
    .eq('id', id)
    .eq('company_id', user.company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ folder: data })
}

// DELETE /api/folders — delete folder (cascade handled by DB)
export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = adminClient()

  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

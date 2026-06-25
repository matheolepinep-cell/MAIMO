import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import type { WorkspaceRole } from '@/types/database'

const adminClient = () =>
  createAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

/** PATCH — update role or is_active for a workspace member */
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspace_id, user_id, role, is_active } = await request.json()
  if (!workspace_id || !user_id) {
    return NextResponse.json({ error: 'Missing workspace_id or user_id' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify caller is admin of this workspace
  const { data: callerMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (callerMember?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Prevent sole admin from demoting themselves
  if (user_id === user.id && role && role !== 'admin') {
    const { count } = await supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace_id)
      .eq('role', 'admin')
      .eq('is_active', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Impossible de se rétrograder : vous êtes le seul administrateur.' },
        { status: 409 }
      )
    }
  }

  const updates: { role?: WorkspaceRole; is_active?: boolean } = {}
  if (role !== undefined) updates.role = role as WorkspaceRole
  if (is_active !== undefined) updates.is_active = is_active

  const { error } = await supabase
    .from('workspace_members')
    .update(updates)
    .eq('workspace_id', workspace_id)
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Revoke active sessions if deactivating
  if (is_active === false) {
    try {
      await adminClient().auth.admin.signOut(user_id, 'global')
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true })
}

/** DELETE — permanently remove a member from the workspace */
export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspace_id, user_id } = await request.json()
  if (!workspace_id || !user_id) {
    return NextResponse.json({ error: 'Missing workspace_id or user_id' }, { status: 400 })
  }

  if (user_id === user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas vous supprimer vous-même.' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify caller is admin
  const { data: callerMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (callerMember?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Remove from this workspace
  const { error: delErr } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspace_id)
    .eq('user_id', user_id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Check if user belongs to any other workspace in the company
  const { count: otherWsCount } = await supabase
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)

  if ((otherWsCount ?? 0) === 0) {
    // No other workspaces → delete auth account
    try {
      await adminClient().auth.admin.deleteUser(user_id)
    } catch {
      // Non-fatal if auth deletion fails
    }
  } else {
    // Still in other workspaces → just revoke sessions
    try {
      await adminClient().auth.admin.signOut(user_id, 'global')
    } catch { /* Non-fatal */ }
  }

  return NextResponse.json({ success: true })
}

import { createClient } from '@/lib/supabase/server'
import type { WorkspaceRole } from '@/types/database'

export async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile ?? null
}

/** Returns the authenticated user's role in a given workspace, or null if not a member. */
export async function getWorkspaceRole(workspaceId: string): Promise<WorkspaceRole | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data || !data.is_active) return null
  return data.role as WorkspaceRole
}

/** Throws 403 response if the caller's workspace role is not in the allowed list. */
export async function requireWorkspaceRole(
  workspaceId: string,
  allowed: WorkspaceRole[]
): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(workspaceId)
  if (!role || !allowed.includes(role)) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return role
}

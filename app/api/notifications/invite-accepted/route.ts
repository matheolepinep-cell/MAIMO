import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { createNotification } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId, workspaceName } = await request.json()
  if (!workspaceId) return NextResponse.json({ ok: true })

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  // Find workspace admins
  const { data: admins } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('user_id', user.id)

  await Promise.all(
    (admins ?? []).map((a: { user_id: string }) =>
      createNotification(
        a.user_id,
        null,
        'company_updated',
        `${user.full_name} a rejoint l'espace ${workspaceName ?? ''}`,
        null,
        { workspace_id: workspaceId }
      )
    )
  )

  return NextResponse.json({ ok: true })
}

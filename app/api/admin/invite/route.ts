import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, full_name, role, workspaces } = await request.json()

  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const baseUrl = env.appUrl
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role, company_id: user.company_id, workspaces: workspaces ?? [] },
    redirectTo: `${baseUrl}/set-password`,
  })

  if (inviteError) {
    console.error('Invite error:', inviteError)
    const msg = inviteError.message ?? ''
    const alreadyExists = msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')
    return NextResponse.json(
      { error: alreadyExists ? 'Cet email est déjà associé à un compte.' : msg },
      { status: 400 }
    )
  }

  if (!inviteData?.user) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  // Create users profile row (is_active=false, has_set_password=false until they set their password)
  const { error: profileError } = await supabase.from('users').upsert({
    id: inviteData.user.id,
    email,
    full_name,
    role: role ?? 'commercial',
    company_id: user.company_id,
    is_active: false,
    has_set_password: false,
  })

  if (profileError) {
    console.error('Profile creation error:', profileError)
  }

  // Create workspace_members rows immediately so the invite is visible in team page
  if (Array.isArray(workspaces) && workspaces.length > 0) {
    const wmRows = workspaces.map((w: { wsId: string; role: string }) => ({
      workspace_id: w.wsId,
      user_id: inviteData.user.id,
      role: w.role ?? 'member',
      is_active: false,
    }))
    const { error: wmError } = await supabase.from('workspace_members').upsert(wmRows, {
      onConflict: 'workspace_id,user_id',
    })
    if (wmError) console.error('workspace_members insert error:', wmError)
  }

  return NextResponse.json({ success: true, user_id: inviteData.user.id })
}

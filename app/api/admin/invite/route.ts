import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, full_name, role } = await request.json()

  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role, company_id: user.company_id },
    redirectTo: 'https://www.maimoo.fr/invite',
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

  // Create users profile row (is_active=false until they set their password)
  const { error: profileError } = await supabase.from('users').upsert({
    id: inviteData.user.id,
    email,
    full_name,
    role,
    company_id: user.company_id,
    is_active: false,
  })

  if (profileError) {
    console.error('Profile creation error:', profileError)
    // Non-fatal: invite was sent, profile can be created on first login
  }

  return NextResponse.json({ success: true, user_id: inviteData.user.id })
}

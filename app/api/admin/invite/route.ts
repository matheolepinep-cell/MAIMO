import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, full_name, role, company_id } = await request.json()

  if (!email || !full_name || !role || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Send invite email via Supabase Auth
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role, company_id },
  })

  if (inviteError) {
    console.error('Invite error:', inviteError)
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
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
    company_id,
    is_active: false,
  })

  if (profileError) {
    console.error('Profile creation error:', profileError)
    // Non-fatal: invite was sent, profile can be created on first login
  }

  return NextResponse.json({ success: true, user_id: inviteData.user.id })
}

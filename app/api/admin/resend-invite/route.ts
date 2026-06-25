import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, full_name } = await request.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.maimoo.fr'
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo: `${baseUrl}/set-password`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

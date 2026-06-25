import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

const adminSupabase = () => createSupabaseAdmin(
  env.supabaseUrl, env.supabaseServiceRole
)

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await params
  const body = await request.json()

  const supabase = adminSupabase()
  const { data, error } = await supabase
    .from('users')
    .update(body)
    .eq('id', userId)
    .eq('company_id', user.company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await params
  const supabase = adminSupabase()

  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  await supabase.from('users').delete().eq('id', userId)
  return NextResponse.json({ success: true })
}

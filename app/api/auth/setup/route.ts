import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const { userId, email, fullName, companyName, phone, consentMarketing } = await request.json()

  if (!userId || !email || !fullName || !companyName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = adminClient()

  // Verify the user actually exists in Supabase Auth before touching the DB
  const { data: authUser, error: authLookupError } = await supabase.auth.admin.getUserById(userId)
  if (authLookupError || !authUser.user || authUser.user.email !== email) {
    return NextResponse.json({ error: 'User verification failed' }, { status: 403 })
  }

  // Create company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: companyName.trim() })
    .select()
    .single()

  if (companyError || !company) {
    console.error('[SETUP] Company creation error:', companyError?.message)
    return NextResponse.json({ error: 'Company creation failed', detail: companyError?.message }, { status: 500 })
  }

  // Create user profile
  const now = new Date().toISOString()
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email,
    full_name: fullName.trim(),
    role: 'admin',
    company_id: company.id,
    is_active: true,
    phone: phone?.replace(/\s/g, '').trim() || null,
    consent_cgu: true,
    consent_cgu_date: now,
    consent_privacy: true,
    consent_privacy_date: now,
    consent_marketing: consentMarketing ?? false,
    consent_marketing_date: consentMarketing ? now : null,
  })

  if (userError) {
    console.error('[SETUP] User insert error:', userError.message)
    // Rollback company to avoid orphan rows
    await supabase.from('companies').delete().eq('id', company.id)
    return NextResponse.json({ error: 'User profile creation failed', detail: userError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, companyId: company.id })
}

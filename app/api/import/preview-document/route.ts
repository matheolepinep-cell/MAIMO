import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzeDocument } from '@/lib/document-analyzer'
import { findMatchingAccount } from '@/lib/account-matching'
import type { AccountRow } from '@/lib/account-matching'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { limited } = await checkRateLimit(user.id, '/api/import/analyze-document')
  if (limited) {
    return NextResponse.json(
      { error: 'Limite quotidienne atteinte (20 analyses/jour). Réessayez demain.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  const { text, file_name, file_type, company_id } = await request.json()
  if (!text || !file_name || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)
  const analysis = await analyzeDocument(text, file_name, file_type ?? '')

  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('id, name, phone, website, industry, revenue, description, city')
    .eq('company_id', company_id)
  const accountsArr: AccountRow[] = existingAccounts ?? []

  const companiesStatus = analysis.companies
    .filter((c) => c.name?.trim())
    .map((c) => {
      const name = c.name.trim()
      const existing = findMatchingAccount(name, accountsArr)
      let fieldsWouldAdd = 0
      if (existing) {
        if (!existing.phone && c.phone) fieldsWouldAdd++
        if (!existing.website && c.website) fieldsWouldAdd++
        if (!existing.industry && c.sector) fieldsWouldAdd++
        if (!existing.revenue && c.revenue) fieldsWouldAdd++
        if (!existing.description && c.description) fieldsWouldAdd++
        if (!existing.city && c.city) fieldsWouldAdd++
      }
      return { name, isNew: !existing, existingId: existing?.id ?? null, fieldsWouldAdd, company: c }
    })

  const hasActions = companiesStatus.length > 0 || analysis.contacts.length > 0

  return NextResponse.json({ analysis, companiesStatus, hasActions })
}

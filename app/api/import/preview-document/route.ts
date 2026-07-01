import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzeDocument } from '@/lib/document-analyzer'
import { findMatchingAccount } from '@/lib/account-matching'
import type { AccountRow } from '@/lib/account-matching'

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

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

  // ── 2-step detection fallback when full analysis finds no companies ──────
  let detectedAccountId: string | null = null
  let detectedAccountName: string | null = null
  let detectedCompanyNameRaw = ''

  if (companiesStatus.length === 0) {
    try {
      const detectionMsg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `À partir de ce document, identifie le nom de l'entreprise cliente principale (pas notre entreprise, mais le client dont parle ce document). Réponds UNIQUEMENT avec le nom exact de l'entreprise, rien d'autre. Si tu ne peux pas déterminer, réponds "INCONNU".\n\nDocument :\n${text.substring(0, 2000)}`,
        }],
      })
      detectedCompanyNameRaw = detectionMsg.content[0].type === 'text' ? detectionMsg.content[0].text.trim() : 'INCONNU'

      if (detectedCompanyNameRaw && detectedCompanyNameRaw !== 'INCONNU') {
        const { data: exactMatch } = await supabase
          .from('accounts').select('id, name')
          .eq('company_id', company_id)
          .ilike('name', detectedCompanyNameRaw)
          .limit(1).maybeSingle()

        if (exactMatch) {
          detectedAccountId = exactMatch.id
          detectedAccountName = exactMatch.name
        } else {
          const keywords = detectedCompanyNameRaw.split(/\s+/).filter((w: string) => w.length > 3)
          for (const keyword of keywords) {
            const { data: kwMatch } = await supabase
              .from('accounts').select('id, name')
              .eq('company_id', company_id)
              .ilike('name', `%${keyword}%`)
              .limit(1).maybeSingle()
            if (kwMatch) { detectedAccountId = kwMatch.id; detectedAccountName = kwMatch.name; break }
          }
        }
      }
    } catch (err) {
      console.error('[preview-document] detection error:', err)
    }
  }

  return NextResponse.json({ analysis, companiesStatus, hasActions, detectedAccountId, detectedAccountName, detectedCompanyNameRaw })
}

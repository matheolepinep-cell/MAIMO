import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, company_id } = await request.json()

  if (!text || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', company_id)
    .order('name')

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ matched: false, company_name: '', account_id: null, confidence: 'low', reason: 'Aucune entreprise dans l\'espace.' })
  }

  const companyList = accounts.map((a: { name: string }) => a.name).join(', ')
  const excerpt = text.slice(0, 3000)

  const prompt = `Analyse ce document et identifie à quelle entreprise cliente il correspond parmi la liste suivante.
Réponds UNIQUEMENT en JSON valide sans markdown : { "matched": true|false, "company_name": "<nom exact de la liste ou vide>", "confidence": "high"|"medium"|"low", "reason": "<explication courte et directe en 1 phrase, sans markdown ni caractères spéciaux>" }

Liste des entreprises : ${companyList}

Document (extrait) :
${excerpt}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const result = JSON.parse(cleaned)

    const matchedAccount = (accounts as { id: string; name: string }[]).find(
      (a) => a.name === result.company_name
    )

    return NextResponse.json({
      matched: result.matched ?? false,
      company_name: result.company_name ?? '',
      account_id: matchedAccount?.id ?? null,
      confidence: result.confidence ?? 'low',
      reason: result.reason ?? '',
    })
  } catch (err) {
    console.error('detect-company error:', err)
    return NextResponse.json({ matched: false, company_name: '', account_id: null, confidence: 'low', reason: '' })
  }
}

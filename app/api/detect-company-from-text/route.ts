import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { detectCompanyInQuery } from '@/lib/search-utils'

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json()
  if (!text?.trim()) return NextResponse.json({ account_id: null, account_name: null, detected_name: null })

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', user.company_id)
    .order('name')

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ account_id: null, account_name: null, detected_name: null })
  }

  // Fuzzy match first
  const fuzzy = detectCompanyInQuery(text, accounts)
  if (fuzzy && (fuzzy.confidence === 'high' || fuzzy.confidence === 'medium')) {
    return NextResponse.json({ account_id: fuzzy.account.id, account_name: fuzzy.account.name, detected_name: null })
  }

  const wordCount = text.trim().split(/\s+/).length
  const excerpt = text.slice(0, 1000)

  // Short texts (3-7 words): just try raw name extraction
  if (wordCount < 8) {
    if (wordCount < 3) return NextResponse.json({ account_id: null, account_name: null, detected_name: null })
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 48,
        messages: [{ role: 'user', content: `Extrais le nom d'une entreprise ou organisation mentionnée dans ce texte. Réponds UNIQUEMENT en JSON : { "name": "<nom ou null>" }\n\nTexte : ${excerpt}` }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
      const result = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim())
      return NextResponse.json({ account_id: null, account_name: null, detected_name: result.name ?? null })
    } catch {
      return NextResponse.json({ account_id: null, account_name: null, detected_name: null })
    }
  }

  // Long texts: combined prompt — match from list AND extract raw name
  const companyList = (accounts as { id: string; name: string }[]).map((a) => a.name).join(', ')

  const prompt = `Analyse ce texte commercial et réponds en JSON.
1. Parmi cette liste : ${companyList} — laquelle est mentionnée ? → "matched_company": "<nom exact ou null>"
2. Quel nom d'entreprise ou d'organisation est cité dans le texte (même si hors liste) ? → "detected_name": "<nom ou null>"

JSON uniquement : { "matched_company": ..., "detected_name": ... }

Texte : ${excerpt}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 96,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const result = JSON.parse(cleaned)

    const matched = (accounts as { id: string; name: string }[]).find(
      (a) => a.name === result.matched_company
    )

    return NextResponse.json({
      account_id: matched?.id ?? null,
      account_name: matched?.name ?? null,
      detected_name: matched ? null : (result.detected_name ?? null),
    })
  } catch {
    return NextResponse.json({ account_id: null, account_name: null, detected_name: null })
  }
}

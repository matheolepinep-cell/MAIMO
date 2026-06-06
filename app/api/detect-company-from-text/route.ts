import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { detectCompanyInQuery } from '@/lib/search-utils'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json()
  if (!text?.trim()) return NextResponse.json({ account_id: null, account_name: null })

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', user.company_id)
    .order('name')

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ account_id: null, account_name: null })
  }

  // Fuzzy match first
  const fuzzy = detectCompanyInQuery(text, accounts)
  if (fuzzy && (fuzzy.confidence === 'high' || fuzzy.confidence === 'medium')) {
    return NextResponse.json({ account_id: fuzzy.account.id, account_name: fuzzy.account.name })
  }

  // Claude fallback only for longer texts (more context to work with)
  if (text.trim().split(/\s+/).length < 8) {
    return NextResponse.json({ account_id: null, account_name: null })
  }

  const companyList = accounts.map((a: { name: string }) => a.name).join(', ')
  const excerpt = text.slice(0, 1000)

  const prompt = `Parmi la liste d'entreprises suivante, laquelle est mentionnée dans ce texte ?
Réponds UNIQUEMENT en JSON : { "company_name": "<nom exact de la liste ou null>" }
Si aucune n'est mentionnée clairement, réponds { "company_name": null }

Liste : ${companyList}

Texte : ${excerpt}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const result = JSON.parse(cleaned)

    const matched = (accounts as { id: string; name: string }[]).find(
      (a) => a.name === result.company_name
    )

    return NextResponse.json({
      account_id: matched?.id ?? null,
      account_name: matched?.name ?? null,
    })
  } catch {
    return NextResponse.json({ account_id: null, account_name: null })
  }
}

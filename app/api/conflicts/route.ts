import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId, newContent } = await request.json()
  if (!accountId || !newContent?.trim()) {
    return NextResponse.json({ hasConflict: false, hasDuplicate: false, conflicts: [] })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: notes } = await supabase
    .from('notes')
    .select('content, title')
    .eq('account_id', accountId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!notes?.length) {
    return NextResponse.json({ hasConflict: false, hasDuplicate: false, conflicts: [] })
  }

  const existingNotesText = notes.map((n: { title: string | null; content: string }, i: number) =>
    `Note ${i + 1}${n.title ? ` (${n.title})` : ''}: ${n.content}`
  ).join('\n\n')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'Analyse si le contenu suivant contredit ou duplique des informations déjà présentes dans les notes existantes. Réponds uniquement en JSON : { "hasConflict": boolean, "hasDuplicate": boolean, "conflicts": [{ "existingInfo": string, "newInfo": string, "type": "contradiction"|"duplicate" }] }. Sois concis et ne signale que les vrais conflits factuels (chiffres différents, statuts contradictoires, dates incompatibles, informations identiques).',
      messages: [{
        role: 'user',
        content: `Nouvelle note à sauvegarder:\n${newContent}\n\nNotes existantes:\n${existingNotesText}`,
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { hasConflict: false, hasDuplicate: false, conflicts: [] }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ hasConflict: false, hasDuplicate: false, conflicts: [] })
  }
}

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

export type ActionData = {
  first_name?: string; last_name?: string; position?: string
  email?: string; phone?: string; company_name?: string
  city?: string; sector?: string; status?: 'client' | 'prospect'
  field?: string; value?: string
}

export type TranscriptionAction = {
  type: 'create_contact' | 'update_company' | 'create_company' | 'add_info'
  data: ActionData
}

export type TranscriptionAnalysis = {
  note_content: string | null
  actions: TranscriptionAction[]
  summary: string
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { transcription } = await request.json()
  if (!transcription?.trim()) {
    return NextResponse.json({ note_content: null, actions: [], summary: '' } satisfies TranscriptionAnalysis)
  }

  const prompt = `Analyse cette transcription vocale d'un commercial et extrais les informations structurées. Réponds UNIQUEMENT en JSON valide sans markdown.

Format :
{
  "note_content": "texte factuel reformulé proprement, ou null si que des instructions",
  "actions": [
    { "type": "create_contact", "data": { "first_name": "...", "last_name": "...", "position": "...", "email": "...", "phone": "..." } },
    { "type": "update_company", "data": { "field": "téléphone", "value": "..." } },
    { "type": "create_company", "data": { "company_name": "...", "city": "...", "sector": "...", "status": "prospect" } },
    { "type": "add_info", "data": { "field": "email", "value": "..." } }
  ],
  "summary": "résumé en une phrase"
}

Règles :
- note_content = informations factuelles utiles reformulées naturellement, sans les instructions ni commandes
- actions = toutes les actions détectées : ajouter un interlocuteur, créer une fiche, mettre à jour un champ
- summary = une phrase résumant ce qui a été dit/fait
- Exemples : "ajoute comme interlocuteur Jean Dupont directeur commercial", "son email c'est jd@mail.com", "crée une fiche pour Acme", "mets à jour le téléphone"

Transcription : "${transcription.slice(0, 2000)}"`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json({
      note_content: result.note_content ?? null,
      actions: Array.isArray(result.actions) ? result.actions : [],
      summary: result.summary ?? '',
    } satisfies TranscriptionAnalysis)
  } catch {
    // Fallback: return raw transcription unchanged
    return NextResponse.json({ note_content: transcription, actions: [], summary: '' } satisfies TranscriptionAnalysis)
  }
}

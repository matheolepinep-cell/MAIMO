import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, workspaceId, companyId } = await request.json()
  if (!text?.trim()) return NextResponse.json({ actions: [] })

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let accountsQ = supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', user.company_id)
    .order('name')
    .limit(200)
  if (workspaceId) accountsQ = accountsQ.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
  const { data: accounts } = await accountsQ

  let companyName: string | null = null
  if (companyId) {
    const { data: acc } = await supabase.from('accounts').select('name').eq('id', companyId).single()
    companyName = acc?.name ?? null
  }

  const companiesList = (accounts ?? []).map((a: { name: string }) => a.name).join(', ') || 'aucune'

  const prompt = `Tu es un assistant qui analyse le message d'un commercial et détermine exactement quoi faire.

Message du commercial : "${text.slice(0, 2000)}"

Entreprise actuelle dans l'app : ${companyId && companyName ? companyName : 'aucune'}
Liste des entreprises existantes : ${companiesList}

Réponds UNIQUEMENT avec ce JSON, sans aucun texte avant ou après :
{
  "actions": [
    {
      "type": "create_company",
      "company_name": "...",
      "city": "...",
      "sector": "...",
      "status": "prospect"
    },
    {
      "type": "create_contact",
      "first_name": "...",
      "last_name": "...",
      "position": "...",
      "email": "...",
      "phone": "...",
      "company_name": "..."
    },
    {
      "type": "create_note",
      "content": "...",
      "company_name": "..."
    }
  ]
}

Règles STRICTES :
- Si le message demande de créer une entreprise → action create_company
- Si le message mentionne un interlocuteur/contact/personne → action create_contact
- Si le message contient des informations factuelles sur un client (RDV, appel, info) → action create_note avec UNIQUEMENT les infos factuelles, jamais les instructions
- Si le message ne contient QUE des instructions (créer, ajouter, mettre...) sans info factuelle → PAS de create_note
- Ne jamais mettre les instructions dans le contenu d'une note
- Une note = uniquement des faits, jamais des commandes
- company_name dans create_contact doit correspondre exactement à une entreprise existante ou à une entreprise créée dans la même réponse

RÈGLE ABSOLUE : chaque action create_note ET create_contact DOIT avoir un company_name renseigné (chaîne non vide). Si aucune entreprise n'est explicitement mentionnée, déduis-la depuis le contexte (nom de personne, secteur, indice dans la conversation). Si vraiment impossible à déduire, génère une action create_company avec le nom le plus probable extrait du texte, même partiel, et utilise ce nom dans company_name.
Il est INTERDIT de retourner une action create_note ou create_contact avec un company_name vide ou absent.

DÉTECTION DE RDV : Si et SEULEMENT si le message mentionne explicitement une réunion, un rendez-vous ou un appel planifié avec une date ET/OU une heure précise, ajoute un champ "rdv" dans ta réponse JSON (au même niveau que "actions") :
{
  "actions": [...],
  "rdv": {
    "title": "...",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "company_name": "..."
  }
}
La date doit être au format YYYY-MM-DD (année en cours : ${new Date().getFullYear()}). Si seule une heure de début est mentionnée, estime la fin à +1h. Si aucun RDV n'est mentionné, n'inclus PAS le champ "rdv".`

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
      actions: Array.isArray(result.actions) ? result.actions : [],
      rdv: result.rdv ?? null,
    })
  } catch {
    return NextResponse.json({ actions: [] })
  }
}

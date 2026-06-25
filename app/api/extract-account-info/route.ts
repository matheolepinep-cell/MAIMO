import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

interface ExtractedInfo {
  siret?: string
  address?: string
  city?: string
  postal_code?: string
  phone?: string
  email?: string
  website?: string
  industry?: string
  revenue?: string
  employees?: string
  description?: string
  contacts?: Array<{
    first_name: string
    last_name: string
    role?: string
    phone?: string
    email?: string
    notes?: string
    is_main_contact?: boolean
  }>
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { document_id, account_id, company_id } = await request.json()

  if (!document_id || !account_id || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  // Fetch chunks for this document
  const { data: chunks } = await supabase
    .from('chunks')
    .select('content')
    .eq('source_id', document_id)
    .eq('source_type', 'document')
    .order('id', { ascending: true })
    .limit(20)

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ success: true, extracted: null, message: 'Aucun contenu indexé trouvé.' })
  }

  const fullText = chunks.map((c) => c.content).join('\n\n')

  // Ask Claude to extract structured info
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Tu es un assistant qui extrait des informations structurées à partir de documents professionnels. Réponds UNIQUEMENT avec un objet JSON valide. Si une information n'est pas présente, omets le champ. N'invente jamais d'informations. Extrait uniquement ce qui est explicitement mentionné. Pour les champs textuels comme "description" : réponds de façon courte et directe. Donne uniquement les informations demandées, sans introduction ni conclusion. Pas de markdown. Pas de tirets ni étoiles ni emojis. Va droit au but.`,
    messages: [
      {
        role: 'user',
        content: `Extrait les informations de cette entreprise depuis ce document. Retourne un JSON avec ces champs possibles :
- siret (numéro SIRET, 14 chiffres)
- address (adresse postale complète)
- city (ville)
- postal_code (code postal)
- phone (numéro de téléphone principal)
- email (email de contact)
- website (site web)
- industry (secteur d'activité)
- revenue (chiffre d'affaires, ex: "2M€")
- employees (effectif, ex: "15 personnes")
- description (description courte de l'activité, max 2 phrases)
- contacts (tableau de contacts avec : first_name, last_name, role, phone, email, is_main_contact)

Document :
${fullText.slice(0, 6000)}

Réponds uniquement avec le JSON, sans texte avant ou après.`,
      },
    ],
  })

  const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  let extracted: ExtractedInfo | null = null
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0])
  } catch {
    console.error('Failed to parse extraction JSON:', rawText)
    return NextResponse.json({ success: true, extracted: null, message: 'Extraction impossible (format invalide).' })
  }

  if (!extracted) {
    return NextResponse.json({ success: true, extracted: null, message: 'Aucune information extraite.' })
  }

  // Fetch current account to only fill empty fields
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', account_id)
    .single()

  const updates: Record<string, string> = {}
  const updatableFields = ['siret', 'address', 'city', 'postal_code', 'phone', 'email', 'website', 'industry', 'revenue', 'employees', 'description'] as const

  for (const field of updatableFields) {
    const value = extracted[field]
    if (value && !account?.[field]) {
      updates[field] = value
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('accounts').update(updates).eq('id', account_id)
  }

  // Insert new contacts (skip if same name already exists)
  let contactsAdded = 0
  if (extracted.contacts && extracted.contacts.length > 0) {
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('first_name, last_name')
      .eq('account_id', account_id)

    const existingNames = new Set(
      (existingContacts ?? []).map((c) => `${c.first_name.toLowerCase()} ${c.last_name.toLowerCase()}`)
    )

    const newContacts = extracted.contacts.filter((c) => {
      const name = `${c.first_name.toLowerCase()} ${c.last_name.toLowerCase()}`
      return !existingNames.has(name)
    })

    if (newContacts.length > 0) {
      await supabase.from('contacts').insert(
        newContacts.map((c) => ({
          ...c,
          account_id: account_id,
          company_id,
          is_main_contact: c.is_main_contact ?? false,
        }))
      )
      contactsAdded = newContacts.length
    }
  }

  const updatedFields = Object.keys(updates)
  const messageParts: string[] = []
  if (updatedFields.length > 0) messageParts.push(`${updatedFields.length} champ${updatedFields.length > 1 ? 's' : ''} mis à jour`)
  if (contactsAdded > 0) messageParts.push(`${contactsAdded} contact${contactsAdded > 1 ? 's' : ''} ajouté${contactsAdded > 1 ? 's' : ''}`)

  return NextResponse.json({
    success: true,
    extracted,
    updates,
    contacts_added: contactsAdded,
    message: messageParts.length > 0 ? messageParts.join(', ') + '.' : 'Aucune nouvelle information à extraire.',
  })
}

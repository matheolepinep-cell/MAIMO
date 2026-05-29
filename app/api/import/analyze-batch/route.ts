import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAIMO_FIELDS = [
  'company_name', 'city', 'industry', 'status',
  'contact_name', 'contact_role', 'contact_phone', 'contact_email',
  'revenue', 'notes',
] as const
type MaimoField = typeof MAIMO_FIELDS[number]
type Mapping = Record<MaimoField, string | null>

type AnalyzedRow = Record<MaimoField, string> & {
  note_generated: string
  _raw: Record<string, unknown>
  _duplicate_of: string | null  // name of the existing company, or null
}

type ExistingResult = {
  mapping?: Mapping
  analyzed_rows?: AnalyzedRow[]
  warnings?: string[]
  processed?: number
  total_rows?: number
}

function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(sas|sarl|eurl|sasu|earl|snc|sci|sa)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

function applyMapping(rawRow: Record<string, unknown>, mapping: Mapping): Record<MaimoField, string> {
  const result = {} as Record<MaimoField, string>
  for (const field of MAIMO_FIELDS) {
    const col = mapping[field]
    result[field] = col && rawRow[col] != null ? String(rawRow[col]).trim() : ''
  }
  return result
}

function buildTemplateNote(row: Record<MaimoField, string>, fileName: string): string {
  const lines: string[] = []
  if (row.contact_name) {
    const role = row.contact_role ? ` — ${row.contact_role}` : ''
    const company = row.company_name ? ` chez ${row.company_name}` : ''
    lines.push(`${row.contact_name}${role}${company}.`)
  }
  const meta: string[] = [`Import — ${new Date().toLocaleDateString('fr-FR')} (${fileName})`]
  if (row.revenue) meta.push(`CA estimé : ${row.revenue}`)
  if (row.industry) meta.push(`Secteur : ${row.industry}`)
  if (row.notes) meta.push(row.notes)
  lines.push(meta.join(' · '))
  return lines.filter(Boolean).join('\n')
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { import_id, offset, limit = 20, company_id } = await request.json()

  if (!import_id || offset === undefined || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: importRecord, error: loadErr } = await supabase
    .from('bulk_imports')
    .select('preview, result, file_name')
    .eq('id', import_id)
    .single()

  if (loadErr || !importRecord) {
    return NextResponse.json({ error: 'Import introuvable.' }, { status: 404 })
  }

  const previewPayload = importRecord.preview as { headers: string[]; raw_rows: Record<string, unknown>[]; total_rows: number }
  const { headers, raw_rows: rawRows, total_rows: totalRows } = previewPayload
  const fileName = importRecord.file_name as string
  const existingResult = (importRecord.result ?? null) as ExistingResult | null

  const isFirstBatch = offset === 0
  const batchRows = rawRows.slice(offset, offset + limit)
  if (batchRows.length === 0) {
    return NextResponse.json({ processed: totalRows, total: totalRows, next_offset: null })
  }

  // Load existing accounts for duplicate detection
  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', company_id)

  const dbNorm = new Map<string, string>(
    (existingAccounts ?? []).map((a) => [normalize(a.name), a.name])
  )

  // Build intra-file dedup set from already-analyzed rows
  const seenNorm = new Set<string>(
    (existingResult?.analyzed_rows ?? []).map((r) => normalize(r.company_name ?? ''))
  )

  // Call Claude for this batch
  let mapping: Mapping = existingResult?.mapping ?? ({} as Mapping)
  let claudeRows: Partial<AnalyzedRow>[]
  let batchWarnings: string[] = []

  try {
    const sampleRows = rawRows.slice(0, 3)

    const noteInstruction = `Pour note_generated : si un interlocuteur est présent, commencer OBLIGATOIREMENT par "[PRENOM NOM] — [POSTE] chez [ENTREPRISE]." puis 1-2 phrases de contexte commercial en français. Si pas d'interlocuteur, rédiger directement 1-2 phrases de contexte.`

    const prompt = isFirstBatch
      ? `Tu es un assistant d'import de données commerciales.

En-têtes : ${JSON.stringify(headers)}
Echantillon (3 premières lignes) : ${JSON.stringify(sampleRows)}
Lignes à analyser (${batchRows.length} lignes) : ${JSON.stringify(batchRows)}

Retourne UNIQUEMENT un JSON valide sans markdown :
{
  "mapping": {
    "company_name": "<colonne ou null>",
    "city": "<colonne ou null>",
    "industry": "<colonne ou null>",
    "status": "<colonne ou null>",
    "contact_name": "<colonne nom interlocuteur ou null>",
    "contact_role": "<colonne poste/fonction/titre ou null>",
    "contact_phone": "<colonne ou null>",
    "contact_email": "<colonne ou null>",
    "revenue": "<colonne ou null>",
    "notes": "<colonne ou null>"
  },
  "warnings": [],
  "rows": [
    {
      "company_name": "valeur",
      "city": "valeur",
      "industry": "valeur",
      "status": "client ou prospect",
      "contact_name": "valeur ou vide",
      "contact_role": "poste ou vide",
      "contact_phone": "valeur ou vide",
      "contact_email": "valeur ou vide",
      "revenue": "valeur ou vide",
      "note_generated": "voir instruction"
    }
  ]
}
Le statut doit être "client" ou "prospect".
${noteInstruction}`
      : `Tu es un assistant d'import de données commerciales.

Mapping déjà détecté : ${JSON.stringify(mapping)}
Lignes à analyser (${batchRows.length} lignes, offset ${offset}) : ${JSON.stringify(batchRows)}

Applique le mapping et retourne UNIQUEMENT un JSON valide sans markdown :
{
  "rows": [
    {
      "company_name": "valeur selon mapping",
      "city": "valeur",
      "industry": "valeur",
      "status": "client ou prospect",
      "contact_name": "valeur ou vide",
      "contact_role": "poste ou vide",
      "contact_phone": "valeur ou vide",
      "contact_email": "valeur ou vide",
      "revenue": "valeur ou vide",
      "note_generated": "voir instruction"
    }
  ]
}
Le statut doit être "client" ou "prospect".
${noteInstruction}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    if (isFirstBatch) {
      mapping = parsed.mapping as Mapping
      batchWarnings = parsed.warnings ?? []
      if (!mapping.company_name) {
        batchWarnings.push("Aucune colonne 'nom entreprise' n'a été détectée.")
      }
    }

    claudeRows = parsed.rows ?? []
  } catch (err) {
    console.error('Claude batch error at offset', offset, err)
    // Fallback: apply mapping + template notes
    claudeRows = batchRows.map((raw) => {
      const mapped = applyMapping(raw, mapping)
      return { ...mapped, note_generated: buildTemplateNote(mapped, fileName) }
    })
  }

  // Annotate rows with duplicate info and raw data
  const analyzedBatch: AnalyzedRow[] = claudeRows.map((row, i) => {
    const rawRow = batchRows[i] ?? {}
    const companyName = (row.company_name ?? '').trim()
    const norm = normalize(companyName)
    let duplicateOf: string | null = null

    if (norm) {
      if (dbNorm.has(norm)) {
        duplicateOf = dbNorm.get(norm)!
      } else if (seenNorm.has(norm)) {
        duplicateOf = companyName
      } else {
        seenNorm.add(norm)
      }
    }

    return {
      company_name: row.company_name ?? '',
      city: row.city ?? '',
      industry: row.industry ?? '',
      status: row.status ?? 'prospect',
      contact_name: row.contact_name ?? '',
      contact_role: row.contact_role ?? '',
      contact_phone: row.contact_phone ?? '',
      contact_email: row.contact_email ?? '',
      revenue: row.revenue ?? '',
      notes: row.notes ?? '',
      note_generated: row.note_generated ?? '',
      _raw: rawRow,
      _duplicate_of: duplicateOf,
    }
  })

  // Merge with previous batches
  const previousRows = existingResult?.analyzed_rows ?? []
  const allAnalyzedRows = [...previousRows, ...analyzedBatch]
  const processed = offset + analyzedBatch.length
  const isDone = processed >= totalRows

  const newResult: ExistingResult = {
    mapping: isFirstBatch ? mapping : (existingResult?.mapping ?? mapping),
    analyzed_rows: allAnalyzedRows,
    warnings: [...(existingResult?.warnings ?? []), ...batchWarnings],
    processed,
    total_rows: totalRows,
  }

  await supabase.from('bulk_imports').update({
    status: isDone ? 'review' : 'analyzing',
    result: newResult,
  }).eq('id', import_id)

  return NextResponse.json({
    processed,
    total: totalRows,
    next_offset: isDone ? null : processed,
    ...(isFirstBatch ? { mapping } : {}),
  })
}

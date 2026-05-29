import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import { getAuthenticatedUser } from '@/lib/auth-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAIMO_FIELDS = [
  'company_name', 'city', 'industry', 'status',
  'contact_name', 'contact_phone', 'contact_email',
  'revenue', 'notes',
] as const
type MaimoField = typeof MAIMO_FIELDS[number]
type Mapping = Record<MaimoField, string | null>

type ParsedRow = Record<MaimoField, string> & { note_generated: string; _raw: Record<string, unknown> }

function applyMapping(rawRow: Record<string, unknown>, mapping: Mapping): Record<MaimoField, string> {
  const result = {} as Record<MaimoField, string>
  for (const field of MAIMO_FIELDS) {
    const col = mapping[field]
    result[field] = col && rawRow[col] != null ? String(rawRow[col]).trim() : ''
  }
  return result
}

function buildTemplateNote(row: Record<MaimoField, string>, fileName: string): string {
  const parts: string[] = [`Import — ${new Date().toLocaleDateString('fr-FR')} (${fileName})`]
  if (row.revenue) parts.push(`CA estimé : ${row.revenue}`)
  if (row.industry) parts.push(`Secteur : ${row.industry}`)
  if (row.contact_name) {
    const contact = [row.contact_name, row.contact_phone, row.contact_email].filter(Boolean).join(' · ')
    parts.push(`Contact : ${contact}`)
  }
  if (row.notes) parts.push(`Notes : ${row.notes}`)
  return parts.join('\n')
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file_path, file_name, company_id } = await request.json()

  if (!file_path || !file_name || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Download file from Storage
  const { data: fileBlob, error: dlError } = await supabase.storage.from('imports').download(file_path)
  if (dlError || !fileBlob) {
    return NextResponse.json({ error: 'Impossible de télécharger le fichier.' }, { status: 500 })
  }

  // 2. Parse with xlsx
  let headers: string[]
  let rawRows: Record<string, unknown>[]
  try {
    const buffer = await fileBlob.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (jsonRows.length === 0) {
      return NextResponse.json({ error: 'Fichier vide ou illisible.' }, { status: 422 })
    }
    headers = Object.keys(jsonRows[0])
    rawRows = jsonRows
  } catch {
    return NextResponse.json({ error: 'Impossible de lire le fichier. Vérifiez le format (.xlsx, .xls, .csv).' }, { status: 422 })
  }

  const totalRows = rawRows.length
  const sampleRows = rawRows.slice(0, 3)

  // 3. Call Claude to detect mapping + generate notes for first 50 rows
  const rowsForClaude = rawRows.slice(0, 50)

  let mapping: Mapping
  let claudeRows: ParsedRow[]
  let warnings: string[] = []

  try {
    const prompt = `Tu es un assistant d'import de données commerciales.

En-têtes détectés : ${JSON.stringify(headers)}
Echantillon (3 premières lignes) : ${JSON.stringify(sampleRows)}
Toutes les lignes (${rowsForClaude.length} max) : ${JSON.stringify(rowsForClaude)}

Analyse ce fichier et retourne UNIQUEMENT un JSON valide sans markdown, sans commentaire :
{
  "mapping": {
    "company_name": "<colonne ou null>",
    "city": "<colonne ou null>",
    "industry": "<colonne ou null>",
    "status": "<colonne ou null>",
    "contact_name": "<colonne ou null>",
    "contact_phone": "<colonne ou null>",
    "contact_email": "<colonne ou null>",
    "revenue": "<colonne ou null>",
    "notes": "<colonne ou null>"
  },
  "confidence": 0.95,
  "warnings": [],
  "rows": [
    {
      "company_name": "valeur",
      "city": "valeur",
      "industry": "valeur",
      "status": "client ou prospect",
      "contact_name": "valeur ou vide",
      "contact_phone": "valeur ou vide",
      "contact_email": "valeur ou vide",
      "revenue": "valeur ou vide",
      "note_generated": "Note professionnelle rédigée en français à partir de TOUTES les données de cette ligne"
    }
  ]
}

Pour chaque ligne, rédige une note_generated en langage naturel professionnel (2-4 phrases) qui résume les informations commerciales importantes. Inclus statut, secteur, CA, contact si disponibles.
Le statut doit être "client" ou "prospect" (si non détectable, mettre "prospect").`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    mapping = parsed.mapping as Mapping
    claudeRows = (parsed.rows as ParsedRow[]) ?? []
    warnings = parsed.warnings ?? []

    if (!mapping.company_name) {
      warnings.push("Aucune colonne 'nom entreprise' n'a été détectée. Vérifiez le mapping.")
    }
  } catch (err) {
    console.error('Claude error:', err)
    return NextResponse.json({ error: "L'analyse IA a échoué. Réessayez." }, { status: 500 })
  }

  // 4. Build full preview (apply mapping + template for rows beyond 50)
  const fullPreview: ParsedRow[] = []
  for (let i = 0; i < rawRows.length; i++) {
    if (i < claudeRows.length) {
      fullPreview.push({ ...claudeRows[i], _raw: rawRows[i] })
    } else {
      const mapped = applyMapping(rawRows[i], mapping)
      fullPreview.push({
        ...mapped,
        note_generated: buildTemplateNote(mapped, file_name),
        _raw: rawRows[i],
      })
    }
  }

  // 5. Store in bulk_imports (preview jsonb contient tout)
  const { data: importRecord, error: insertError } = await supabase
    .from('bulk_imports')
    .insert({
      company_id,
      user_id: user.id,
      file_name,
      file_url: file_path,
      status: 'review',
      preview: {
        mapping,
        rows: fullPreview,
        total_rows: totalRows,
        warnings,
      },
    })
    .select('id')
    .single()

  if (insertError || !importRecord) {
    console.error('DB insert error:', insertError)
    return NextResponse.json({ error: 'Erreur de sauvegarde. Vérifiez que la table bulk_imports existe.' }, { status: 500 })
  }

  return NextResponse.json({
    import_id: importRecord.id,
    mapping,
    preview: fullPreview.slice(0, 5),
    total_rows: totalRows,
    warnings,
  })
}

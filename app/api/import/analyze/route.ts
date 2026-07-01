import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import OpenAI from 'openai'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractTextFromPDF } from '@/lib/pdf-extract'

const openai = new OpenAI({ apiKey: env.openaiApiKey ?? '' })

function getExt(filePath: string) {
  return (filePath.split('.').pop() ?? '').toLowerCase()
}

async function extractText(buffer: Buffer, ext: string, fileName: string): Promise<string> {
  if (ext === 'pdf') {
    return await extractTextFromPDF(buffer, fileName)
  }

  if (ext === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (['png', 'jpeg', 'jpg'].includes(ext)) {
    const base64 = buffer.toString('base64')
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: 'Extrais tout le texte et les informations visibles dans cette image' },
        ],
      }],
      max_tokens: 2000,
    })
    return response.choices[0].message.content ?? ''
  }

  throw new Error(`Type non supporté : ${fileName}`)
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { limited } = await checkRateLimit(user.id, '/api/import/analyze')
  if (limited) {
    return NextResponse.json(
      { error: 'Limite quotidienne atteinte (20 analyses/jour). Réessayez demain.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  const { file_path, file_name, company_id } = await request.json()

  if (!file_path || !file_name || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  console.log('[import/analyze] Downloading file', { file_path, file_name })
  const { data: fileBlob, error: dlError } = await supabase.storage.from('imports').download(file_path)
  if (dlError || !fileBlob) {
    console.error('[import/analyze] Storage download failed', { file_path, error: dlError?.message })
    return NextResponse.json({ error: 'Impossible de télécharger le fichier.', detail: dlError?.message }, { status: 500 })
  }

  const ext = getExt(file_path)
  const buffer = Buffer.from(await fileBlob.arrayBuffer())
  console.log('[import/analyze] File downloaded', { ext, bufferSize: buffer.length })

  // ── SPREADSHEET flow ──────────────────────────────────────────────────────
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    let headers: string[]
    let rawRows: Record<string, unknown>[]
    try {
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
      return NextResponse.json({ error: 'Impossible de lire le fichier. Vérifiez le format.' }, { status: 422 })
    }

    const totalRows = rawRows.length

    const { data: importRecord, error: insertError } = await supabase
      .from('bulk_imports')
      .insert({
        company_id,
        user_id: user.id,
        file_name,
        file_url: file_path,
        status: 'parsed',
        preview: { headers, raw_rows: rawRows, total_rows: totalRows },
      })
      .select('id')
      .single()

    if (insertError || !importRecord) {
      return NextResponse.json({ error: 'Erreur de sauvegarde.' }, { status: 500 })
    }

    return NextResponse.json({ type: 'spreadsheet', import_id: importRecord.id, total_rows: totalRows, headers })
  }

  // ── DOCUMENT flow (PDF / DOCX / image) ───────────────────────────────────
  try {
    console.log('[import/analyze] Starting text extraction', { ext, file_name, bufferSize: buffer.length })
    const text = await extractText(buffer, ext, file_name)
    console.log('[import/analyze] Text extracted', { length: text?.length, preview: text?.substring(0, 120) })

    if (!text.trim()) {
      console.warn('[import/analyze] Empty text after extraction', { ext, file_name })
      return NextResponse.json({ error: 'Impossible d\'extraire le texte du document.' }, { status: 422 })
    }
    return NextResponse.json({ type: 'document', text, file_path, file_name })
  } catch (err) {
    const e = err as Error
    console.error('[import/analyze] Extraction failed', {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      ext,
      file_name,
      bufferSize: buffer.length,
    })
    return NextResponse.json({
      error: e?.message ?? 'Erreur lors de l\'extraction du texte.',
      step: 'text_extraction',
      ext,
    }, { status: 500 })
  }
}

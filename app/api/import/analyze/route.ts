import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { getAuthenticatedUser } from '@/lib/auth-server'

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

  // 1. Download from Storage
  const { data: fileBlob, error: dlError } = await supabase.storage.from('imports').download(file_path)
  if (dlError || !fileBlob) {
    return NextResponse.json({ error: 'Impossible de télécharger le fichier.' }, { status: 500 })
  }

  // 2. Parse with xlsx — no Claude call here
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
    return NextResponse.json({ error: 'Impossible de lire le fichier. Vérifiez le format.' }, { status: 422 })
  }

  const totalRows = rawRows.length

  // 3. Store raw rows — Claude analysis happens via /api/import/analyze-batch
  const { data: importRecord, error: insertError } = await supabase
    .from('bulk_imports')
    .insert({
      company_id,
      user_id: user.id,
      file_name,
      file_url: file_path,
      status: 'parsed',
      preview: {
        headers,
        raw_rows: rawRows,
        total_rows: totalRows,
      },
    })
    .select('id')
    .single()

  if (insertError || !importRecord) {
    console.error('DB insert error:', insertError)
    return NextResponse.json({ error: 'Erreur de sauvegarde.' }, { status: 500 })
  }

  return NextResponse.json({
    import_id: importRecord.id,
    total_rows: totalRows,
    headers,
  })
}

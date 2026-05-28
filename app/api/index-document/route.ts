import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

async function resolveFileUrl(fileUrl: string, supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } }): Promise<string> {
  if (!fileUrl.startsWith('http')) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(fileUrl, 3600)
    if (data?.signedUrl) return data.signedUrl
  }
  return fileUrl
}

async function extractText(fileUrl: string, fileType: string): Promise<string> {
  const response = await fetch(fileUrl)
  const buffer = await response.arrayBuffer()
  const nodeBuffer = Buffer.from(buffer)

  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(nodeBuffer)
    return result.text
  }

  if (fileType === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: nodeBuffer })
    return result.value
  }

  if (fileType === 'xlsx') {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(nodeBuffer, { type: 'buffer' })
    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name]
      return XLSX.utils.sheet_to_txt(sheet)
    }).join('\n\n')
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { document_id, file_url, file_type, client_id, company_id } = await request.json()

  if (!document_id || !file_url || !file_type || !client_id || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const resolvedUrl = await resolveFileUrl(file_url, supabase)
    const text = await extractText(resolvedUrl, file_type)
    const chunks = chunkText(text)

    if (chunks.length === 0) {
      await supabase.from('documents').update({ is_indexed: true }).eq('id', document_id)
      return NextResponse.json({ success: true, chunks: 0 })
    }

    // Remove old chunks
    await supabase.from('chunks').delete().eq('source_id', document_id).eq('source_type', 'document')

    const embeddings = await embedBatch(chunks)

    const rows = chunks.map((chunk, i) => ({
      company_id,
      client_id,
      source_type: 'document' as const,
      source_id: document_id,
      content: chunk,
      embedding: embeddings[i],
    }))

    await supabase.from('chunks').insert(rows)
    await supabase.from('documents').update({ is_indexed: true }).eq('id', document_id)

    // Trigger auto-extraction in background (non-blocking)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/extract-account-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ document_id, client_id, company_id }),
    }).catch(() => {})

    return NextResponse.json({ success: true, chunks: rows.length })
  } catch (err) {
    console.error('Document indexing error:', err)
    return NextResponse.json({ error: 'Failed to index document' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

async function resolveFileUrl(fileUrl: string, supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } }): Promise<string> {
  if (!fileUrl.startsWith('http')) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(fileUrl, 3600)
    if (data?.signedUrl) return data.signedUrl
    console.error('[index-document] createSignedUrl failed for path:', fileUrl)
  }
  return fileUrl
}

async function extractText(fileUrl: string, fileType: string): Promise<string> {
  console.log('[index-document] fetching file:', fileUrl.slice(0, 80))
  const response = await fetch(fileUrl)
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
  const buffer = await response.arrayBuffer()
  const nodeBuffer = Buffer.from(buffer)
  console.log('[index-document] file size:', nodeBuffer.length, 'bytes, type:', fileType)

  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(nodeBuffer)
    console.log('[index-document] pdf extracted chars:', result.text.length)
    return result.text
  }

  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> }
    const result = await mammoth.extractRawText({ buffer: nodeBuffer })
    console.log('[index-document] docx extracted chars:', result.value.length)
    return result.value
  }

  if (fileType === 'xlsx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as { read: (b: Buffer, o: object) => { SheetNames: string[]; Sheets: Record<string, object> }; utils: { sheet_to_txt: (s: object) => string } }
    const workbook = XLSX.read(nodeBuffer, { type: 'buffer' })
    const text = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name]
      return XLSX.utils.sheet_to_txt(sheet)
    }).join('\n\n')
    console.log('[index-document] xlsx extracted chars:', text.length)
    return text
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { document_id, file_url, file_type, account_id, company_id, workspace_id } = await request.json()

  if (!document_id || !file_url || !file_type || !account_id || !company_id) {
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
    console.log('[index-document] chunks produced:', chunks.length)

    if (chunks.length === 0) {
      console.error('[index-document] no chunks — extracted text was empty or too short:', text.slice(0, 200))
      return NextResponse.json({ success: true, chunks: 0 })
    }

    // Fetch metadata for chunk enrichment (parallel with existing flow)
    const [{ data: accountRow }, { data: docRow }, { data: wsRow }] = await Promise.all([
      supabase.from('accounts').select('name').eq('id', account_id).single(),
      supabase.from('documents').select('title, file_name, created_at').eq('id', document_id).single(),
      workspace_id ? supabase.from('workspaces').select('name').eq('id', workspace_id).single() : Promise.resolve({ data: null }),
    ])
    const accountName = accountRow?.name ?? 'Inconnu'
    const fileName = docRow?.title ?? docRow?.file_name ?? file_url.split('/').pop() ?? 'Document'
    const workspaceName = (wsRow as { name?: string } | null)?.name ?? ''
    const importDate = docRow?.created_at
      ? new Date(docRow.created_at).toLocaleDateString('fr-FR')
      : new Date().toLocaleDateString('fr-FR')

    const docPrefix = workspaceName
      ? `[Entreprise: ${accountName} | Fichier: ${fileName} | Date: ${importDate} | Type: Document | Workspace: ${workspaceName}]`
      : `[Entreprise: ${accountName} | Fichier: ${fileName} | Date: ${importDate} | Type: Document]`
    const enrichedChunks = chunks.map((chunk) => `${docPrefix}\n\n${chunk}`)

    // Remove old chunks
    await supabase.from('chunks').delete().eq('source_id', document_id).eq('source_type', 'document')

    const embeddings = await embedBatch(enrichedChunks)

    const rows = enrichedChunks.map((chunk, i) => ({
      company_id,
      account_id,
      source_type: 'document' as const,
      source_id: document_id,
      content: chunk,
      embedding: embeddings[i],
      workspace_id: workspace_id ?? null,
      company_name: accountName,
    }))

    await supabase.from('chunks').insert(rows)
    console.log('[INDEX] Document indexé:', document_id, 'chunks créés:', rows.length)

    // Trigger auto-extraction in background (non-blocking)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/extract-account-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ document_id, account_id, company_id }),
    }).catch(() => {})

    return NextResponse.json({ success: true, chunks: rows.length })
  } catch (err) {
    console.error('Document indexing error:', err)
    return NextResponse.json({ error: 'Failed to index document' }, { status: 500 })
  }
}

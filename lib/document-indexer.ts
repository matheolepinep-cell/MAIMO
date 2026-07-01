import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { env } from './env'
import { chunkText } from './chunker'
import { embedBatch } from './embeddings'

/* ─── Storage URL helpers ─── */

// Parse any file_url format into { bucket, path }
// Handles:
//   'documents:path'      → bucket=documents
//   'imports:path'        → bucket=imports
//   'https://...sign/...' → extract bucket+path from URL
//   'bare/path'           → fallback to imports bucket
function parseBucketAndPath(fileUrl: string): { bucket: string; path: string } {
  if (fileUrl.startsWith('http')) {
    const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) }
  }
  const colonIdx = fileUrl.indexOf(':')
  if (colonIdx > 0) {
    const prefix = fileUrl.slice(0, colonIdx)
    if (['documents', 'imports'].includes(prefix)) {
      return { bucket: prefix, path: fileUrl.slice(colonIdx + 1) }
    }
  }
  return { bucket: 'imports', path: fileUrl }
}

type StorageClient = {
  storage: { from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null }> } }
}

export async function resolveStorageUrl(fileUrl: string, supabase: StorageClient): Promise<string> {
  const { bucket, path } = parseBucketAndPath(fileUrl)
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (data?.signedUrl) return data.signedUrl
  // Already a usable http URL (e.g. public bucket) — return as-is
  if (fileUrl.startsWith('http')) return fileUrl
  throw new Error(`Cannot resolve storage URL: ${fileUrl}`)
}

/* ─── Text extraction ─── */

export async function extractTextFromUrl(url: string, fileType: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(buffer)
    return result.text
  }
  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> }
    return (await mammoth.extractRawText({ buffer })).value
  }
  if (fileType === 'xlsx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as {
      read: (b: Buffer, o: object) => { SheetNames: string[]; Sheets: Record<string, object> }
      utils: { sheet_to_txt: (s: object) => string }
    }
    const wb = XLSX.read(buffer, { type: 'buffer' })
    return wb.SheetNames.map((n) => XLSX.utils.sheet_to_txt(wb.Sheets[n])).join('\n\n')
  }
  throw new Error(`Unsupported file type: ${fileType}`)
}

/* ─── Main indexer ─── */

export interface IndexDocumentParams {
  documentId: string
  fileUrl: string       // 'documents:path' | 'imports:path' | signed-http-url
  fileType: 'pdf' | 'docx' | 'xlsx' | 'image'
  accountId: string
  companyId: string
  workspaceId: string | null
  text?: string         // pre-extracted text — skips download + extraction when provided
}

export async function indexDocument(params: IndexDocumentParams): Promise<{ chunks: number }> {
  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)

  // 1. Obtain text
  let text = params.text ?? ''
  if (!text) {
    const signedUrl = await resolveStorageUrl(params.fileUrl, supabase)
    text = await extractTextFromUrl(signedUrl, params.fileType)
  }

  // 2. Chunk
  const rawChunks = chunkText(text)

  if (rawChunks.length === 0) {
    await supabase.from('documents')
      .update({ is_indexed: true, indexed_at: new Date().toISOString() })
      .eq('id', params.documentId)
    return { chunks: 0 }
  }

  // 3. Fetch metadata (account name, file label, workspace name, creation date)
  const [{ data: accountRow }, { data: docRow }, wsResult] = await Promise.all([
    supabase.from('accounts').select('name').eq('id', params.accountId).single(),
    supabase.from('documents').select('title, file_name, created_at').eq('id', params.documentId).single(),
    params.workspaceId
      ? supabase.from('workspaces').select('name').eq('id', params.workspaceId).single()
      : Promise.resolve({ data: null }),
  ])
  const accountName = accountRow?.name ?? 'Inconnu'
  const fileName = docRow?.title ?? docRow?.file_name ?? params.fileUrl.split('/').pop() ?? 'Document'
  const workspaceName = (wsResult.data as { name?: string } | null)?.name ?? ''
  const importDate = docRow?.created_at
    ? new Date(docRow.created_at).toLocaleDateString('fr-FR')
    : new Date().toLocaleDateString('fr-FR')

  // 4. Enrich chunks with metadata prefix (identical format across all indexing paths)
  const prefix = workspaceName
    ? `[Entreprise: ${accountName} | Fichier: ${fileName} | Date: ${importDate} | Type: Document | Workspace: ${workspaceName}]`
    : `[Entreprise: ${accountName} | Fichier: ${fileName} | Date: ${importDate} | Type: Document]`
  const enrichedChunks = rawChunks.map((chunk) => `${prefix}\n\n${chunk}`)

  // 5. Generate embeddings
  const embeddings = await embedBatch(enrichedChunks)

  // 6. Replace old chunks then insert new ones
  await supabase.from('chunks').delete().eq('source_id', params.documentId).eq('source_type', 'document')

  const rows = enrichedChunks.map((chunk, i) => ({
    company_id: params.companyId,
    account_id: params.accountId,
    source_type: 'document' as const,
    source_id: params.documentId,
    content: chunk,
    embedding: embeddings[i],
    workspace_id: params.workspaceId ?? null,
    company_name: accountName,
  }))

  await supabase.from('chunks').insert(rows)

  // 7. Mark document as indexed
  await supabase.from('documents')
    .update({ is_indexed: true, indexed_at: new Date().toISOString() })
    .eq('id', params.documentId)

  return { chunks: rows.length }
}

import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveFileUrl(fileUrl: string, supabase: any): Promise<string> {
  // Extract path from Supabase storage public/signed URL and create a fresh signed URL
  const storageMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/imports\/(.+?)(?:\?|$)/)
  if (storageMatch) {
    const { data } = await supabase.storage.from('imports').createSignedUrl(decodeURIComponent(storageMatch[1]), 3600)
    if (data?.signedUrl) return data.signedUrl
  }
  if (!fileUrl.startsWith('http')) {
    const { data } = await supabase.storage.from('imports').createSignedUrl(fileUrl, 3600)
    if (data?.signedUrl) return data.signedUrl
  }
  return fileUrl
}

async function extractText(fileUrl: string, fileType: string): Promise<string> {
  const response = await fetch(fileUrl)
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>
    return (await pdfParse(buffer)).text
  }
  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }
    return (await mammoth.extractRawText({ buffer })).value
  }
  if (fileType === 'xlsx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as { read: (b: Buffer, o: object) => { SheetNames: string[]; Sheets: Record<string, object> }; utils: { sheet_to_txt: (s: object) => string } }
    const wb = XLSX.read(buffer, { type: 'buffer' })
    return wb.SheetNames.map((n) => XLSX.utils.sheet_to_txt(wb.Sheets[n])).join('\n\n')
  }
  throw new Error(`Unsupported type: ${fileType}`)
}

// Paginated reindex — call repeatedly until done:true
// ?offset=0&limit=15&phase=notes  (default)
// ?offset=0&limit=5&phase=docs    (documents, slower due to file download)
// First call with offset=0 deletes all chunks before starting.
export async function GET(request: Request) {
  const adminKey = request.headers.get('x-admin-key')
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const limit = parseInt(url.searchParams.get('limit') ?? '15', 10)
  const phase = url.searchParams.get('phase') ?? 'notes'

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // On first call: delete all existing chunks
  if (offset === 0 && phase === 'notes') {
    console.log('[reindex-all] Deleting all chunks...')
    const { error: delErr } = await supabase.from('chunks').delete().not('id', 'is', null)
    if (delErr) {
      console.error('[reindex-all] Delete failed:', delErr.message)
      return NextResponse.json({ error: 'Delete failed: ' + delErr.message }, { status: 500 })
    }
    console.log('[reindex-all] Chunks deleted.')
  }

  // Load metadata maps
  const [{ data: allAccounts }, { data: allUsers }] = await Promise.all([
    supabase.from('accounts').select('id, name'),
    supabase.from('users').select('id, full_name'),
  ])
  const accountMap = Object.fromEntries((allAccounts ?? []).map((a) => [a.id, a.name]))
  const userMap = Object.fromEntries((allUsers ?? []).map((u) => [u.id, u.full_name]))

  let reindexed = 0
  let errors = 0
  let total = 0
  let done = false
  let firstError: string | null = null

  if (phase === 'notes') {
    const { data: notes, count } = await supabase
      .from('notes')
      .select('id, content, account_id, company_id, workspace_id, created_at, user_id', { count: 'exact' })
      .eq('is_deleted', false)
      .not('content', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    total = count ?? 0
    const batch = (notes ?? []).filter((n) => n.content?.trim())

    for (const note of batch) {
      try {
        const accountName = accountMap[note.account_id] ?? 'Inconnu'
        const authorName = userMap[note.user_id] ?? 'Inconnu'
        const noteDate = new Date(note.created_at).toLocaleDateString('fr-FR')

        const rawChunks = chunkText(note.content)
        if (rawChunks.length === 0) continue

        const enrichedChunks = rawChunks.map(
          (chunk) => `[Entreprise: ${accountName} | Date: ${noteDate} | Auteur: ${authorName} | Type: Note]\n\n${chunk}`
        )
        const embeddings = await embedBatch(enrichedChunks)

        const rows = enrichedChunks.map((chunk, j) => ({
          company_id: note.company_id ?? null,
          account_id: note.account_id,
          source_type: 'note' as const,
          source_id: note.id,
          content: chunk,
          embedding: embeddings[j],
          workspace_id: note.workspace_id ?? null,
          company_name: accountName,
          author_name: authorName,
        }))

        const { error } = await supabase.from('chunks').insert(rows)
        if (error) { errors++; if (!firstError) firstError = `Note ${note.id}: ${error.message}`; console.error(`Note ${note.id}:`, error.message) }
        else reindexed += rows.length
      } catch (err) {
        errors++
        const msg = err instanceof Error ? err.message : String(err)
        if (!firstError) firstError = `Note ${note.id} catch: ${msg}`
        console.error(`Note ${note.id} failed:`, err)
      }
    }

    done = offset + batch.length >= total
    console.log(`[reindex-all] notes batch offset=${offset} processed=${batch.length}/${total} chunks=${reindexed} errors=${errors}`)

  } else if (phase === 'docs') {
    const { data: docs, count } = await supabase
      .from('documents')
      .select('id, title, file_name, file_url, file_type, account_id, company_id, workspace_id, created_at', { count: 'exact' })
      .eq('is_deleted', false)
      .not('file_url', 'is', null)
      .in('file_type', ['pdf', 'docx', 'xlsx'])
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    total = count ?? 0
    const batch = docs ?? []

    for (const doc of batch) {
      try {
        const accountName = accountMap[doc.account_id] ?? 'Inconnu'
        const fileName = doc.title ?? doc.file_name ?? 'Document'
        const importDate = new Date(doc.created_at).toLocaleDateString('fr-FR')

        const resolvedUrl = await resolveFileUrl(doc.file_url, supabase)
        const text = await extractText(resolvedUrl, doc.file_type)
        const rawChunks = chunkText(text)
        if (rawChunks.length === 0) continue

        const enrichedChunks = rawChunks.map(
          (chunk) => `[Entreprise: ${accountName} | Fichier: ${fileName} | Date: ${importDate} | Type: Document]\n\n${chunk}`
        )
        const embeddings = await embedBatch(enrichedChunks)

        const rows = enrichedChunks.map((chunk, j) => ({
          company_id: doc.company_id ?? null,
          account_id: doc.account_id,
          source_type: 'document' as const,
          source_id: doc.id,
          content: chunk,
          embedding: embeddings[j],
          workspace_id: doc.workspace_id ?? null,
          company_name: accountName,
        }))

        const { error } = await supabase.from('chunks').insert(rows)
        if (error) { errors++; if (!firstError) firstError = `Doc ${doc.id}: ${error.message}`; console.error(`Doc ${doc.id}:`, error.message) }
        else reindexed += rows.length
      } catch (err) {
        errors++
        const msg = err instanceof Error ? err.message : String(err)
        if (!firstError) firstError = `Doc ${doc.id} catch: ${msg}`
        console.error(`Doc ${doc.id} failed:`, err)
      }
    }

    done = offset + batch.length >= total
    console.log(`[reindex-all] docs batch offset=${offset} processed=${batch.length}/${total} chunks=${reindexed} errors=${errors}`)
  }

  return NextResponse.json({
    phase,
    offset,
    limit,
    total,
    reindexed,
    errors,
    done,
    next_offset: done ? null : offset + limit,
    first_error: firstError,
  })
}

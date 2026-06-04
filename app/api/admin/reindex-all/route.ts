import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

// ── Text extraction helpers (mirrors index-document) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveFileUrl(fileUrl: string, supabase: any): Promise<string> {
  if (fileUrl.startsWith('http')) return fileUrl
  const { data } = await supabase.storage.from('imports').createSignedUrl(fileUrl, 3600)
  return data?.signedUrl ?? fileUrl
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

export async function GET(request: Request) {
  const adminKey = request.headers.get('x-admin-key')
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('[reindex-all] Starting full reindex...')

  // ── 1. Delete all existing chunks ──
  const { error: delErr } = await supabase.from('chunks').delete().not('id', 'is', null)
  if (delErr) {
    console.error('[reindex-all] Failed to delete chunks:', delErr)
    return NextResponse.json({ error: 'Failed to delete chunks: ' + delErr.message }, { status: 500 })
  }
  console.log('[reindex-all] All chunks deleted.')

  // ── 2. Load all data in parallel ──
  const [
    { data: allNotes },
    { data: allDocs },
    { data: allAccounts },
    { data: allUsers },
  ] = await Promise.all([
    supabase.from('notes').select('id, content, account_id, company_id, workspace_id, created_at, user_id').eq('is_deleted', false).not('content', 'is', null),
    supabase.from('documents').select('id, title, file_name, file_url, file_type, account_id, company_id, workspace_id, created_at').eq('is_deleted', false).not('file_url', 'is', null),
    supabase.from('accounts').select('id, name'),
    supabase.from('users').select('id, full_name'),
  ])

  const accountMap = Object.fromEntries((allAccounts ?? []).map((a) => [a.id, a.name]))
  const userMap = Object.fromEntries((allUsers ?? []).map((u) => [u.id, u.full_name]))

  let reindexed = 0
  let errors = 0

  // ── 3. Reindex notes ──
  const notes = (allNotes ?? []).filter((n) => n.content?.trim())
  console.log(`[reindex-all] Reindexing ${notes.length} notes...`)

  const NOTE_BATCH = 10
  for (let i = 0; i < notes.length; i += NOTE_BATCH) {
    const batch = notes.slice(i, i + NOTE_BATCH)
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
        if (error) { console.error(`[reindex-all] Note ${note.id} insert error:`, error.message); errors++ }
        else reindexed += rows.length
      } catch (err) {
        console.error(`[reindex-all] Note ${note.id} failed:`, err)
        errors++
      }
    }
    console.log(`[reindex-all] Notes progress: ${Math.min(i + NOTE_BATCH, notes.length)}/${notes.length}`)
  }

  // ── 4. Reindex documents ──
  const docs = (allDocs ?? []).filter((d) => ['pdf', 'docx', 'xlsx'].includes(d.file_type))
  console.log(`[reindex-all] Reindexing ${docs.length} documents...`)

  for (const doc of docs) {
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
      if (error) { console.error(`[reindex-all] Doc ${doc.id} insert error:`, error.message); errors++ }
      else reindexed += rows.length
    } catch (err) {
      console.error(`[reindex-all] Doc ${doc.id} failed:`, err)
      errors++
    }
  }

  console.log(`[reindex-all] Done. Reindexed: ${reindexed} chunks, Errors: ${errors}`)

  return NextResponse.json({
    success: true,
    reindexed,
    errors,
    notes_processed: notes.length,
    docs_processed: docs.length,
  })
}

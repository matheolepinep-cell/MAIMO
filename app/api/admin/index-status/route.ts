import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const adminKey = request.headers.get('x-admin-key')
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all indexed source IDs (deduplicated in memory)
  const [
    { data: indexedNoteData },
    { data: indexedDocData },
    { count: totalNotes },
    { count: totalDocs },
    { data: recentNotes },
    { data: recentDocs },
    { count: totalChunks },
  ] = await Promise.all([
    supabase.from('chunks').select('source_id').eq('source_type', 'note'),
    supabase.from('chunks').select('source_id').eq('source_type', 'document'),
    supabase.from('notes').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase.from('notes').select('id, title, account_id, created_at').eq('is_deleted', false).order('created_at', { ascending: false }).limit(10),
    supabase.from('documents').select('id, title, file_name, account_id, created_at').eq('is_deleted', false).order('created_at', { ascending: false }).limit(5),
    supabase.from('chunks').select('id', { count: 'exact', head: true }),
  ])

  const indexedNoteIds = new Set((indexedNoteData ?? []).map((r) => r.source_id as string))
  const indexedDocIds = new Set((indexedDocData ?? []).map((r) => r.source_id as string))

  const notesWithoutChunks = (totalNotes ?? 0) - indexedNoteIds.size
  const docsWithoutChunks = (totalDocs ?? 0) - indexedDocIds.size

  const recentNotesStatus = (recentNotes ?? []).map((n) => ({
    id: n.id,
    title: n.title ?? '(sans titre)',
    account_id: n.account_id,
    created_at: n.created_at,
    indexed: indexedNoteIds.has(n.id),
  }))

  const recentDocsStatus = (recentDocs ?? []).map((d) => ({
    id: d.id,
    title: d.title ?? d.file_name ?? '(sans titre)',
    account_id: d.account_id,
    created_at: d.created_at,
    indexed: indexedDocIds.has(d.id),
  }))

  return NextResponse.json({
    total_chunks: totalChunks ?? 0,
    total_notes: totalNotes ?? 0,
    total_docs: totalDocs ?? 0,
    notes_without_chunks: notesWithoutChunks,
    docs_without_chunks: docsWithoutChunks,
    indexed_note_count: indexedNoteIds.size,
    indexed_doc_count: indexedDocIds.size,
    recent_notes: recentNotesStatus,
    recent_docs: recentDocsStatus,
  })
}

import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'
import type { UserProfile } from '@/types/database'

export async function POST(request: Request) {
  const user = (await getAuthenticatedUser()) as UserProfile | null
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { note_id, content, account_id, company_id, workspace_id } = await request.json()

  if (!note_id || !content || !account_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch metadata for chunk enrichment (parallel)
  const [{ data: account }, { data: note }, { data: workspace }] = await Promise.all([
    supabase.from('accounts').select('name').eq('id', account_id).single(),
    supabase.from('notes').select('created_at').eq('id', note_id).single(),
    workspace_id ? supabase.from('workspaces').select('name').eq('id', workspace_id).single() : Promise.resolve({ data: null }),
  ])
  const accountName = account?.name ?? 'Inconnu'
  const authorName = user.full_name ?? 'Inconnu'
  const workspaceName = (workspace as { name?: string } | null)?.name ?? ''
  const noteDate = note?.created_at
    ? new Date(note.created_at).toLocaleDateString('fr-FR')
    : new Date().toLocaleDateString('fr-FR')

  await supabase.from('chunks').delete().eq('source_id', note_id).eq('source_type', 'note')

  const rawChunks = chunkText(content)
  if (rawChunks.length === 0) {
    return NextResponse.json({ success: true, chunks: 0 })
  }

  const notePrefix = workspaceName
    ? `[Entreprise: ${accountName} | Date: ${noteDate} | Auteur: ${authorName} | Type: Note | Workspace: ${workspaceName}]`
    : `[Entreprise: ${accountName} | Date: ${noteDate} | Auteur: ${authorName} | Type: Note]`
  const enrichedChunks = rawChunks.map((chunk) => `${notePrefix}\n\n${chunk}`)

  let embeddings: number[][]
  try {
    embeddings = await embedBatch(enrichedChunks)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Embedding failed'
    console.error('Embedding error:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const rows = enrichedChunks.map((chunk, i) => ({
    company_id: company_id ?? null,
    account_id,
    source_type: 'note' as const,
    source_id: note_id,
    content: chunk,
    embedding: embeddings[i],
    workspace_id: workspace_id ?? null,
    company_name: accountName,
    author_name: authorName,
  }))

  const { error } = await supabase.from('chunks').insert(rows)

  if (error) {
    console.error('Chunk insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[INDEX] Note indexée:', note_id, 'chunks créés:', rows.length)
  return NextResponse.json({ success: true, chunks: rows.length })
}

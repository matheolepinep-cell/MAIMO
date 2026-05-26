import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { embed } from '@/lib/embeddings'
import type { SearchSource } from '@/types/database'

interface SearchChunk {
  id: string
  content: string
  source_type: 'note' | 'document'
  source_id: string
  similarity: number
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, client_id, company_id } = await request.json()

  if (!query || !client_id || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Vectorize query
  const queryEmbedding = await embed(query)

  // Search chunks via Supabase RPC
  const { data: chunks, error } = await supabase.rpc('search_chunks', {
    query_embedding: queryEmbedding,
    match_client_id: client_id,
    match_company_id: company_id,
    match_count: 5,
  })

  if (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({
      answer: "Je n'ai trouvé aucune information pertinente pour répondre à votre question.",
      sources: [],
    })
  }

  const typedChunks = chunks as SearchChunk[]

  // Separate note and document source ids
  const noteIds = typedChunks.filter((c) => c.source_type === 'note').map((c) => c.source_id)
  const docIds = typedChunks.filter((c) => c.source_type === 'document').map((c) => c.source_id)

  // Enrich notes: get title + created_at + author (via users join)
  let notesMap: Record<string, { title: string | null; created_at: string; author: string }> = {}
  if (noteIds.length > 0) {
    const { data: notes } = await supabase
      .from('notes')
      .select('id, title, created_at, user_id')
      .in('id', noteIds)

    if (notes && notes.length > 0) {
      const userIds = [...new Set(notes.map((n) => n.user_id).filter(Boolean))]
      const { data: users } = userIds.length > 0
        ? await supabase.from('users').select('id, full_name').in('id', userIds)
        : { data: [] }
      const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]))
      notesMap = Object.fromEntries(
        notes.map((n) => [n.id, { title: n.title, created_at: n.created_at, author: userMap[n.user_id] ?? 'Inconnu' }])
      )
    }
  }

  // Enrich documents: get title + file_name + file_url
  let docsMap: Record<string, { title: string | null; file_name: string; file_url: string; created_at: string }> = {}
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, file_name, file_url, created_at')
      .in('id', docIds)

    if (docs) {
      docsMap = Object.fromEntries(docs.map((d) => [d.id, d]))
    }
  }

  const fmt = (d: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

  // Build context string for Claude
  const contextParts = typedChunks.map((chunk, i) => {
    if (chunk.source_type === 'note') {
      const note = notesMap[chunk.source_id]
      const dateStr = note ? fmt(note.created_at) : 'date inconnue'
      const authorStr = note?.author ?? 'source inconnue'
      return `[Extrait ${i + 1} — note du ${dateStr} par ${authorStr}]\n${chunk.content}`
    } else {
      const doc = docsMap[chunk.source_id]
      const dateStr = doc ? fmt(doc.created_at) : 'date inconnue'
      const titleStr = doc?.title ?? doc?.file_name ?? 'document'
      return `[Extrait ${i + 1} — document "${titleStr}" du ${dateStr}]\n${chunk.content}`
    }
  }).join('\n\n---\n\n')

  // Claude Haiku generation
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Tu es l'assistant commercial de l'équipe. Réponds uniquement à partir des extraits fournis. Si l'information n'est pas dans les extraits, dis-le clairement. Cite toujours ta source (note du JJ/MM/AAAA par Prénom, ou document "Titre").`,
    messages: [
      {
        role: 'user',
        content: `Extraits disponibles :\n\n${contextParts}\n\n---\n\nQuestion : ${query}`,
      },
    ],
  })

  const answer = message.content[0].type === 'text' ? message.content[0].text : ''

  // Build SearchSource array (deduplicated by source_id)
  const seenIds = new Set<string>()
  const sources: SearchSource[] = []

  for (const chunk of typedChunks) {
    if (seenIds.has(chunk.source_id)) continue
    seenIds.add(chunk.source_id)

    if (chunk.source_type === 'note') {
      const note = notesMap[chunk.source_id]
      sources.push({
        type: 'note',
        id: chunk.source_id,
        title: note?.title ?? 'Note sans titre',
        date: note?.created_at,
        author: note?.author,
      })
    } else {
      const doc = docsMap[chunk.source_id]
      sources.push({
        type: 'document',
        id: chunk.source_id,
        title: doc?.title ?? doc?.file_name ?? 'Document',
        file_name: doc?.file_name,
        url: doc?.file_url,
        date: doc?.created_at,
      })
    }
  }

  return NextResponse.json({ answer, sources })
}

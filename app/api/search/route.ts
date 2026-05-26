import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { embed } from '@/lib/embeddings'

export interface SearchChunk {
  id: string
  content: string
  source_type: 'note' | 'document'
  source_id: string
  metadata: Record<string, unknown>
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

  // Fetch source metadata (notes) for context
  const noteIds = chunks
    .filter((c: SearchChunk) => c.source_type === 'note')
    .map((c: SearchChunk) => c.source_id)

  let notesMap: Record<string, { author_name: string; created_at: string }> = {}
  if (noteIds.length > 0) {
    const { data: notes } = await supabase
      .from('notes')
      .select('id, author_name, created_at')
      .in('id', noteIds)

    if (notes) {
      notesMap = Object.fromEntries(notes.map((n) => [n.id, n]))
    }
  }

  // Build context string
  const contextParts = chunks.map((chunk: SearchChunk, i: number) => {
    const note = notesMap[chunk.source_id]
    const dateStr = note
      ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(note.created_at))
      : 'date inconnue'
    const authorStr = note?.author_name ?? 'source inconnue'
    return `[Extrait ${i + 1} — note du ${dateStr} par ${authorStr}]\n${chunk.content}`
  }).join('\n\n---\n\n')

  // Claude Haiku generation
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Tu es l'assistant commercial de l'équipe. Réponds uniquement à partir des extraits fournis. Si l'information n'est pas dans les extraits, dis-le clairement. Cite toujours ta source (note du JJ/MM/AAAA par Prénom).`,
    messages: [
      {
        role: 'user',
        content: `Extraits disponibles :\n\n${contextParts}\n\n---\n\nQuestion : ${query}`,
      },
    ],
  })

  const answer = message.content[0].type === 'text' ? message.content[0].text : ''

  const sources = chunks.map((chunk: SearchChunk) => {
    const note = notesMap[chunk.source_id]
    return {
      chunk_id: chunk.id,
      source_type: chunk.source_type,
      source_id: chunk.source_id,
      excerpt: chunk.content.slice(0, 120) + (chunk.content.length > 120 ? '…' : ''),
      author_name: note?.author_name ?? null,
      date: note?.created_at ?? null,
    }
  })

  return NextResponse.json({ answer, sources })
}

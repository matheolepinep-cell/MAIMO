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

  const { query, account_id, account_ids, status = 'all', city, company_id, workspace_id, history = [] } = await request.json()

  if (!query || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const queryEmbedding = await embed(query)

  let rawChunks: SearchChunk[]

  if (account_id) {
    const { data, error } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_client_id: account_id,
      match_company_id: company_id,
      match_count: 5,
    })
    if (error) {
      console.error('Search error:', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    rawChunks = (data as SearchChunk[]) ?? []
  } else {
    const { data, error } = await supabase.rpc('search_chunks_global', {
      query_embedding: queryEmbedding,
      match_company_id: company_id,
      match_count: 20,
    })
    if (error) {
      console.error('Global search error:', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    rawChunks = (data as SearchChunk[]) ?? []
  }

  if (rawChunks.length === 0) {
    return NextResponse.json({
      answer: "Je n'ai trouvé aucune information pertinente pour répondre à votre question.",
      sources: [],
    })
  }

  // Enrich notes and documents
  const noteIds = rawChunks.filter((c) => c.source_type === 'note').map((c) => c.source_id)
  const docIds = rawChunks.filter((c) => c.source_type === 'document').map((c) => c.source_id)

  type NoteInfo = { title: string | null; created_at: string; author: string; account_id: string; workspace_id: string | null }
  type DocInfo = { title: string | null; file_name: string; file_url: string; created_at: string; account_id: string; workspace_id: string | null }

  let notesMap: Record<string, NoteInfo> = {}
  if (noteIds.length > 0) {
    const { data: notes } = await supabase
      .from('notes')
      .select('id, title, created_at, user_id, account_id, workspace_id')
      .in('id', noteIds)

    if (notes && notes.length > 0) {
      const userIds = [...new Set(notes.map((n) => n.user_id).filter(Boolean))]
      const { data: users } = userIds.length > 0
        ? await supabase.from('users').select('id, full_name').in('id', userIds)
        : { data: [] }
      const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]))
      notesMap = Object.fromEntries(
        notes.map((n) => [n.id, { title: n.title, created_at: n.created_at, author: userMap[n.user_id] ?? 'Inconnu', account_id: n.account_id, workspace_id: n.workspace_id ?? null }])
      )
    }
  }

  let docsMap: Record<string, DocInfo> = {}
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, file_name, file_url, created_at, account_id, workspace_id')
      .in('id', docIds)

    if (docs) {
      docsMap = Object.fromEntries(docs.map((d) => [d.id, { ...d, workspace_id: d.workspace_id ?? null }]))
    }
  }

  // Post-filter: workspace
  if (workspace_id) {
    rawChunks = rawChunks.filter((chunk) => {
      const ws = chunk.source_type === 'note'
        ? notesMap[chunk.source_id]?.workspace_id
        : docsMap[chunk.source_id]?.workspace_id
      return ws === workspace_id || ws === null || ws === undefined
    })
  }

  // Post-filter: account_ids whitelist + status + city
  const accountIdSet = account_ids && (account_ids as string[]).length > 0 ? new Set(account_ids as string[]) : null
  const needsFilter = accountIdSet || status !== 'all' || city

  let chunks = rawChunks

  if (!account_id && needsFilter) {
    const allAccountIds = [...new Set([
      ...Object.values(notesMap).map((n) => n.account_id),
      ...Object.values(docsMap).map((d) => d.account_id),
    ].filter(Boolean))]

    let accMap: Record<string, { status: string; city: string | null }> = {}
    if (allAccountIds.length > 0) {
      const { data: accData } = await supabase
        .from('accounts')
        .select('id, status, city')
        .in('id', allAccountIds)
      accMap = Object.fromEntries((accData ?? []).map((a) => [a.id, a]))
    }

    chunks = rawChunks.filter((chunk) => {
      const chunkAccountId = chunk.source_type === 'note'
        ? notesMap[chunk.source_id]?.account_id
        : docsMap[chunk.source_id]?.account_id
      if (!chunkAccountId) return false
      if (accountIdSet && !accountIdSet.has(chunkAccountId)) return false
      const acc = accMap[chunkAccountId]
      if (!acc) return false
      if (status === 'client' && acc.status !== 'client') return false
      if (status === 'prospect' && acc.status !== 'prospect') return false
      if (city && !acc.city?.toLowerCase().includes((city as string).toLowerCase())) return false
      return true
    }).slice(0, 5)
  } else if (!account_id) {
    chunks = rawChunks.slice(0, 5)
  }

  if (chunks.length === 0) {
    return NextResponse.json({
      answer: "Je n'ai trouvé aucune information pertinente pour répondre à votre question dans ce périmètre.",
      sources: [],
    })
  }

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

  const contextParts = chunks.map((chunk, i) => {
    if (chunk.source_type === 'note') {
      const note = notesMap[chunk.source_id]
      return `[Extrait ${i + 1} — note du ${note ? fmtDate(note.created_at) : 'date inconnue'} par ${note?.author ?? 'source inconnue'}]\n${chunk.content}`
    } else {
      const doc = docsMap[chunk.source_id]
      return `[Extrait ${i + 1} — document "${doc?.title ?? doc?.file_name ?? 'document'}" du ${doc ? fmtDate(doc.created_at) : 'date inconnue'}]\n${chunk.content}`
    }
  }).join('\n\n---\n\n')

  type HistMsg = { role: 'user' | 'assistant'; content: string }
  const historySlice = (history as HistMsg[]).slice(-8)

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Tu es l'assistant commercial de l'équipe. Réponds uniquement à partir des extraits fournis. Si l'information n'est pas dans les extraits, dis-le clairement. Cite toujours ta source (note du JJ/MM/AAAA par Prénom, ou document "Titre"). Réponds de façon structurée et aérée. Si la réponse contient plusieurs informations distinctes, utilise une liste avec un tiret par élément, une ligne vide entre chaque élément si l'élément fait plus d'une ligne. Maximum 2 phrases par élément. Pas d'introduction, pas de conclusion. Pas d'astérisques, pas de gras, pas de markdown. Commence directement par l'information. Si la réponse tient en une phrase : une seule phrase, pas de liste.`,
    messages: [
      ...historySlice,
      { role: 'user' as const, content: `Extraits disponibles :\n\n${contextParts}\n\n---\n\nQuestion : ${query}` },
    ],
  })

  const answer = message.content[0].type === 'text' ? message.content[0].text : ''

  const seenIds = new Set<string>()
  const sources: SearchSource[] = []

  for (const chunk of chunks) {
    if (seenIds.has(chunk.source_id)) continue
    seenIds.add(chunk.source_id)

    if (chunk.source_type === 'note') {
      const note = notesMap[chunk.source_id]
      sources.push({ type: 'note', id: chunk.source_id, title: note?.title ?? 'Note sans titre', date: note?.created_at, author: note?.author })
    } else {
      const doc = docsMap[chunk.source_id]
      sources.push({ type: 'document', id: chunk.source_id, title: doc?.title ?? doc?.file_name ?? 'Document', file_name: doc?.file_name, url: doc?.file_url, date: doc?.created_at })
    }
  }

  return NextResponse.json({ answer, sources })
}

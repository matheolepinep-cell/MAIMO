import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { embed } from '@/lib/embeddings'
import { detectCompanyInQuery } from '@/lib/search-utils'
import type { SearchSource, UserProfile } from '@/types/database'

interface SearchChunk {
  id: string
  content: string
  source_type: 'note' | 'document'
  source_id: string
  similarity: number
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const user = (await getAuthenticatedUser()) as UserProfile | null
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    query, account_id, account_ids, status = 'all', city,
    company_id, workspace_id: clientWorkspaceId, history = [],
  } = await request.json()

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

  // Validate workspace_id server-side — never trust client
  let workspace_id: string | null = null
  if (clientWorkspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', clientWorkspaceId)
      .maybeSingle()
    if (membership) {
      workspace_id = clientWorkspaceId
    } else {
      const { data: userRow } = await supabase
        .from('users').select('is_super_admin').eq('id', user.id).single()
      if ((userRow as { is_super_admin?: boolean } | null)?.is_super_admin) {
        workspace_id = clientWorkspaceId
      }
    }
  }

  // ── PARALLEL: embed query + load accounts for company detection ──
  const [queryEmbedding, allAccounts] = await Promise.all([
    embed(query),
    (async () => {
      if (account_id) return [] as { id: string; name: string }[]
      let q = supabase.from('accounts').select('id, name').eq('company_id', company_id)
      if (workspace_id) q = q.or(`workspace_id.eq.${workspace_id},workspace_id.is.null`)
      const { data } = await q
      return (data ?? []) as { id: string; name: string }[]
    })(),
  ])

  // ── COMPANY DETECTION via normalize + Levenshtein ──
  const detectedCompany = account_id ? null : detectCompanyInQuery(query, allAccounts)

  // ── HYBRID SEARCH STRATEGY ──
  let rawChunks: SearchChunk[]

  if (account_id) {
    // Account-specific search (user is on an account detail page)
    const { data, error } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_client_id: account_id,
      match_company_id: company_id,
      match_count: 15,
    })
    if (error) {
      console.error('Search error:', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    rawChunks = (data as SearchChunk[]) ?? []
  } else if (detectedCompany?.confidence === 'high') {
    // High confidence: company-specific search only
    const { data, error } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_client_id: detectedCompany.account.id,
      match_company_id: company_id,
      match_count: 15,
    })
    if (error) {
      console.error('Search error (high confidence):', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    rawChunks = (data as SearchChunk[]) ?? []
  } else if (detectedCompany) {
    // Medium or low confidence (typo): company + global, merge with company priority
    const [compRes, globRes] = await Promise.all([
      supabase.rpc('search_chunks', {
        query_embedding: queryEmbedding,
        match_client_id: detectedCompany.account.id,
        match_company_id: company_id,
        match_count: 10,
      }),
      supabase.rpc('search_chunks_global', {
        query_embedding: queryEmbedding,
        match_company_id: company_id,
        match_count: 10,
      }),
    ])
    const compChunks = (compRes.data as SearchChunk[]) ?? []
    const globChunks = (globRes.data as SearchChunk[]) ?? []
    const seen = new Set(compChunks.map((c) => c.id))
    rawChunks = [...compChunks, ...globChunks.filter((c) => !seen.has(c.id))].slice(0, 15)
  } else {
    // No company detected: global search with similarity threshold
    const { data, error } = await supabase.rpc('search_chunks_global', {
      query_embedding: queryEmbedding,
      match_company_id: company_id,
      match_count: 12,
    })
    if (error) {
      console.error('Global search error:', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    rawChunks = ((data as SearchChunk[]) ?? []).filter((c) => c.similarity >= 0.60)
  }

  if (rawChunks.length === 0) {
    return NextResponse.json({
      answer: "Je n'ai trouvé aucune information pertinente pour répondre à votre question.",
      sources: [],
    })
  }

  // ── ENRICH: fetch note/doc metadata ──
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
    }).slice(0, 8)
  } else if (!account_id && !detectedCompany) {
    chunks = rawChunks.slice(0, 8)
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

  // ── TEMPORAL CONTEXT ──
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.toLocaleString('fr-FR', { month: 'long' })
  const lastYear = currentYear - 1
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const dateActuelle = capitalize(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  const userName = user.full_name ?? 'l\'équipe'
  const companyContext = detectedCompany
    ? `Entreprise ciblée : ${detectedCompany.account.name} (confiance : ${detectedCompany.confidence})`
    : account_id ? 'Contexte : fiche entreprise spécifique' : 'Recherche globale sur tout le portefeuille'

  type HistMsg = { role: 'user' | 'assistant'; content: string }
  const historySlice = (history as HistMsg[]).slice(-8)

  const systemPrompt = `Tu es l'assistant commercial de ${userName}. Aujourd'hui nous sommes le ${dateActuelle}.

RÈGLES DE RAISONNEMENT — OBLIGATOIRES :

1. Raisonnement temporel : "l'année dernière" = ${lastYear}, "cette année" = ${currentYear}, "ce mois" = ${currentMonth} ${currentYear}, "récemment" = les 30 derniers jours. Fais toujours la conversion avant de répondre.

2. Tolérance aux fautes : si un nom dans une note ressemble à un nom d'entreprise ou de personne mentionné dans la question (ex: "Ferrettire" ≈ "Ferretti", "Benneteau" ≈ "Bénéteau"), considère que c'est la même entité. Ne rejette jamais une information à cause d'une faute d'orthographe dans une note.

3. Inférence logique : une note datée du 23/06/${lastYear} parle bien de l'année ${lastYear}, qui est l'année dernière si nous sommes en ${currentYear}. Si quelqu'un demande "l'année dernière", cette note est pertinente.

4. Contexte entreprise : chaque chunk est préfixé par [Entreprise: X]. Même si le nom de l'entreprise n'est pas dans le corps du texte, ce chunk appartient à cette entreprise.

5. Ne jamais halluciner : si l'information n'est pas dans les sources, dis "Je n'ai pas cette information dans les notes disponibles." N'invente jamais de chiffres, dates ou faits.

6. Format de réponse : réponse directe sans introduction. Si plusieurs éléments : liste avec un tiret par élément, ligne vide entre chaque élément. Pas de markdown, pas d'astérisques, pas d'emojis. Maximum 2 phrases par élément.

Contexte client détecté : ${companyContext}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...historySlice,
      { role: 'user' as const, content: `Sources disponibles :\n\n${contextParts}\n\n---\n\nQuestion : ${query}` },
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

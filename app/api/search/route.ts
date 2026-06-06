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

// Enriched chunk stored client-side and passed back on follow-up
export interface ChunkUsed {
  id: string
  content: string
  source_type: 'note' | 'document'
  source_id: string
  title?: string | null
  date?: string
  author?: string
  file_name?: string
  file_url?: string
  account_id?: string
}

type HistMsg = { role: 'user' | 'assistant'; content: string }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Normalize French typographic apostrophes to ASCII before pattern matching
function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'")
}

function isFollowUp(
  query: string,
  history: HistMsg[],
  accountId: string | null | undefined,
  allAccounts: { id: string; name: string }[]
): boolean {
  if (history.length === 0) return false

  // Normalize apostrophes then lowercase
  const q = normalizeApostrophes(query).toLowerCase().trim()

  const patterns = [
    "qui te fait dire",
    "pourquoi",
    "comment tu sais",
    "d'où",
    "explique",
    "précise",
    "développe",
    "source",
    "quelle note",
    "quel document",
    "c'est écrit où",
    "tu parles de",
    "c'est-à-dire",
    "et alors",
    "par rapport à quoi",
  ]

  for (const p of patterns) {
    if (q.includes(normalizeApostrophes(p))) return true
  }

  // Short message heuristic: < 6 words with no detectable proper noun
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length < 6) {
    // Proper noun = word after position 0 starting with uppercase
    const hasProperNoun = words.slice(1).some((w) => /^[A-ZÉÀÈÙÂÊÎÔÛÇŒÆ]/.test(w))
    const hasCompany = allAccounts.some((a) => {
      const n = normalizeApostrophes(a.name).toLowerCase()
      return q.includes(n) || n.split(/\s+/).some((w) => w.length > 4 && q.includes(w))
    })
    if (!hasProperNoun && !hasCompany) return true
  }

  return false
}

function buildContextString(chunks: ChunkUsed[]): string {
  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

  return chunks.map((chunk, i) => {
    if (chunk.source_type === 'note') {
      return `[Extrait ${i + 1} — note du ${chunk.date ? fmtDate(chunk.date) : 'date inconnue'} par ${chunk.author ?? 'source inconnue'}]\n${chunk.content}`
    } else {
      return `[Extrait ${i + 1} — document "${chunk.title ?? chunk.file_name ?? 'document'}" du ${chunk.date ? fmtDate(chunk.date) : 'date inconnue'}]\n${chunk.content}`
    }
  }).join('\n\n---\n\n')
}

function buildSourcesFromChunks(chunks: ChunkUsed[]): SearchSource[] {
  const seen = new Set<string>()
  const sources: SearchSource[] = []
  for (const chunk of chunks) {
    if (seen.has(chunk.source_id)) continue
    seen.add(chunk.source_id)
    if (chunk.source_type === 'note') {
      sources.push({ type: 'note', id: chunk.source_id, title: chunk.title ?? 'Note sans titre', date: chunk.date, author: chunk.author })
    } else {
      sources.push({ type: 'document', id: chunk.source_id, title: chunk.title ?? chunk.file_name ?? 'Document', file_name: chunk.file_name, url: chunk.file_url, date: chunk.date })
    }
  }
  return sources
}

export async function POST(request: Request) {
  const user = (await getAuthenticatedUser()) as UserProfile | null
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    query, account_id, account_ids, status = 'all', city,
    company_id, workspace_id: clientWorkspaceId, history = [],
    previousChunks = [],
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

  // Validate workspace_id server-side
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

  // Load accounts for company detection and follow-up detection (global search only)
  let allAccounts: { id: string; name: string }[] = []
  if (!account_id) {
    let q = supabase.from('accounts').select('id, name').eq('company_id', company_id)
    if (workspace_id) q = q.or(`workspace_id.eq.${workspace_id},workspace_id.is.null`)
    const { data } = await q
    allAccounts = (data ?? []) as { id: string; name: string }[]
  }

  const historySlice = (history as HistMsg[]).slice(-8)

  // ── TEMPORAL CONTEXT ──
  const now = new Date()
  const lastYear = now.getFullYear() - 1
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const dateActuelle = capitalize(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

  const buildSystemPrompt = (chunksFormatted: string, companyContext: string, followUp = false) => {
    const followUpNote = followUp
      ? `\n\nL'utilisateur pose une question de suivi. Explique ton raisonnement en citant précisément les extraits qui t'ont permis de donner ta réponse précédente.`
      : ''

    return `Tu es un assistant commercial intelligent et conversationnel. Tu as accès aux notes et documents de l'équipe sur leurs clients. Aujourd'hui nous sommes le ${dateActuelle}.

Comportement attendu :
- Réponds naturellement comme dans une vraie conversation — pas de format rigide
- Déduis et interprète : si quelqu'un demande 'des news' sur un client, donne un résumé naturel de la situation actuelle
- Raisonne sur le contexte : 'l'année dernière' = ${lastYear}, 'récemment' = ces 30 derniers jours, 'bientôt' = dans les 2 prochaines semaines
- Si une information est partielle, déduis ce qui est logique et signale ce qui est une déduction
- Reformule les informations techniques en langage naturel et accessible
- Sois proactif : si tu vois quelque chose d'important dans les notes que l'utilisateur n'a pas demandé mais devrait savoir, mentionne-le

Ce que tu ne fais jamais :
- Inventer des faits qui ne sont pas dans les sources
- Refuser de répondre parce que la question est vague — interprète-la intelligemment
- Répéter 'Je n'ai pas cette information' si des informations partielles existent
- Utiliser un format markdown, des astérisques ou des tirets
- Commencer par 'Je' ou reformuler la question

Si les sources sont insuffisantes, dis-le naturellement en une phrase et propose ce que tu peux faire à la place.

Sources disponibles :
${chunksFormatted}

Contexte : ${companyContext || 'Recherche globale sur tous les clients'}${followUpNote}`
  }

  // ── FOLLOW-UP: skip vector search, reuse previous chunks ──
  const prevChunks = (previousChunks as ChunkUsed[])
  const followUp = prevChunks.length > 0 && isFollowUp(query, historySlice, account_id, allAccounts)

  if (followUp) {
    const contextStr = buildContextString(prevChunks)
    const sources = buildSourcesFromChunks(prevChunks)
    const companyContext = account_id
      ? 'Contexte : fiche entreprise spécifique'
      : 'Recherche globale sur tout le portefeuille'

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(contextStr, companyContext, true),
      messages: [
        ...historySlice,
        { role: 'user' as const, content: query },
      ],
    })

    const answer = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ answer, sources, chunksUsed: prevChunks })
  }

  // ── INDEPENDENT QUERY: full vector search ──
  const [queryEmbedding, detectedCompany] = await Promise.all([
    embed(query),
    Promise.resolve(account_id ? null : detectCompanyInQuery(query, allAccounts)),
  ])

  let rawChunks: SearchChunk[]

  if (account_id) {
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
      chunksUsed: [],
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
      chunksUsed: [],
    })
  }

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))

  // Build enriched chunks for storage and reuse
  const chunksUsed: ChunkUsed[] = chunks.map((chunk) => {
    if (chunk.source_type === 'note') {
      const note = notesMap[chunk.source_id]
      return {
        id: chunk.id,
        content: chunk.content,
        source_type: 'note' as const,
        source_id: chunk.source_id,
        title: note?.title,
        date: note?.created_at,
        author: note?.author,
        account_id: note?.account_id,
      }
    } else {
      const doc = docsMap[chunk.source_id]
      return {
        id: chunk.id,
        content: chunk.content,
        source_type: 'document' as const,
        source_id: chunk.source_id,
        title: doc?.title,
        date: doc?.created_at,
        file_name: doc?.file_name,
        file_url: doc?.file_url,
        account_id: doc?.account_id,
      }
    }
  })

  const contextStr = buildContextString(chunksUsed)

  // ── RECENT FULL NOTES ──
  const targetAccountId = account_id ?? (detectedCompany?.confidence === 'high' ? detectedCompany.account.id : null)
  let recentNotesSection = ''

  if (targetAccountId) {
    let notesQ = supabase
      .from('notes')
      .select('title, content, created_at, user_id')
      .eq('account_id', targetAccountId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(10)
    if (workspace_id) notesQ = notesQ.or(`workspace_id.eq.${workspace_id},workspace_id.is.null`)
    const { data: recentNotes } = await notesQ

    if (recentNotes && recentNotes.length > 0) {
      const noteUserIds = [...new Set(recentNotes.map((n) => n.user_id).filter(Boolean))]
      const { data: noteUsers } = noteUserIds.length > 0
        ? await supabase.from('users').select('id, full_name').in('id', noteUserIds)
        : { data: [] }
      const noteUserMap = Object.fromEntries((noteUsers ?? []).map((u) => [u.id, u.full_name]))

      const companyName = detectedCompany?.account.name
        ?? (account_id ? (notesMap[Object.keys(notesMap)[0]]?.account_id ?? 'l\'entreprise') : 'l\'entreprise')

      recentNotesSection = `\n\nNotes complètes récentes de ${companyName} :\n\n` +
        recentNotes.map((n) => {
          const d = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(n.created_at))
          const author = noteUserMap[n.user_id] ?? 'Inconnu'
          return `--- Note du ${d} par ${author} ---\n${n.title ? `Titre : ${n.title}\n` : ''}${n.content}`
        }).join('\n\n')
    }
  }

  const companyContext = detectedCompany
    ? `Entreprise ciblée : ${detectedCompany.account.name} (confiance : ${detectedCompany.confidence})`
    : account_id ? 'Contexte : fiche entreprise spécifique' : 'Recherche globale sur tout le portefeuille'

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSystemPrompt(contextStr + recentNotesSection, companyContext, false),
    messages: [
      ...historySlice,
      { role: 'user' as const, content: query },
    ],
  })

  const answer = message.content[0].type === 'text' ? message.content[0].text : ''
  const sources = buildSourcesFromChunks(chunksUsed)

  return NextResponse.json({ answer, sources, chunksUsed })
}

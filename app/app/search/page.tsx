'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Briefcase, Globe, Building2, Upload, Mic, MicOff, ArrowUp, FileText, Menu, X, Trash2, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { ConversationsSidebar } from '@/components/search/ConversationsSidebar'
import type { SearchSource } from '@/types/database'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

type ChunkUsed = {
  id: string; content: string; source_type: 'note' | 'document'; source_id: string
  title?: string | null; date?: string; author?: string; file_name?: string; file_url?: string; account_id?: string
}

type SearchTab = 'portfolio' | 'global'
type Message ={ role: 'user' | 'assistant'; content: string; sources?: SearchSource[]; chunks?: ChunkUsed[]; timestamp?: string }

type ConvRow = {
  id: string
  title: string | null
  messages: Message[]
  updated_at: string
  expires_at: string
  created_at: string
}

async function getAccessibleAccountIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
  wsId: string | null
): Promise<string[]> {
  let q = supabase.from('portfolio').select('id, account_id, user_id, visibility').eq('company_id', companyId)
  if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
  const { data: entries } = await q
  const entryIds = (entries ?? []).map((p: { id: string }) => p.id)
  const { data: myAccess } = entryIds.length > 0
    ? await supabase.from('portfolio_access').select('portfolio_id').in('portfolio_id', entryIds).eq('user_id', userId)
    : { data: [] }
  const myAccessSet = new Set((myAccess ?? []).map((a: { portfolio_id: string }) => a.portfolio_id))
  return (entries ?? [])
    .filter((p: { user_id: string; visibility: string; id: string }) =>
      p.user_id === userId || p.visibility === 'team' || (p.visibility === 'custom' && myAccessSet.has(p.id))
    ).map((p: { account_id: string }) => p.account_id)
}

function fmt(d?: string) {
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(d))
}

// ── Markdown renderer ──

function parseInline(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { i++; continue }

    if (/^[-*•–]\s/.test(trimmed)) {
      const listItems: string[] = []
      while (i < lines.length && /^[-*•–]\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•–]\s/, ''))
        i++
      }
      elements.push(
        <ul key={elements.length} style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {listItems.map((item, j) => (
            <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: j < listItems.length - 1 ? 8 : 0 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563EB', flexShrink: 0, marginTop: 10 }} />
              <span
                style={{ lineHeight: 1.8, fontSize: 15, color: '#1A1A2E' }}
                dangerouslySetInnerHTML={{ __html: parseInline(item) }}
              />
            </li>
          ))}
        </ul>
      )
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() && !/^[-*•–]\s/.test(lines[i].trim())) {
      paraLines.push(lines[i])
      i++
    }
    elements.push(
      <p key={elements.length}
        style={{ margin: '0 0 12px', lineHeight: 1.8, fontSize: 15, color: '#1A1A2E' }}
        dangerouslySetInnerHTML={{ __html: paraLines.map(l => parseInline(l.trim())).join('<br />') }}
      />
    )
  }

  return <div>{elements}</div>
}

// ── Source drawer ──

function SourceDrawer({ open, onClose, source, chunks }: {
  open: boolean; onClose: () => void
  source: SearchSource | null; chunks: ChunkUsed[]
}) {
  const router = useRouter()
  if (!source) return null
  const sourceChunks = chunks.filter((c) => c.source_id === source.id)
  const excerpt = sourceChunks.map((c) => c.content).join('\n\n')
  const fmtD = (d?: string) => d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)) : ''

  return (
    <>
      <div
        className="fixed inset-0 z-[70]"
        style={{ background: open ? 'rgba(0,0,0,0.3)' : 'transparent', pointerEvents: open ? 'auto' : 'none', transition: 'background 0.2s' }}
        onClick={onClose}
      />
      <div
        className="fixed top-0 right-0 bottom-0 z-[70] flex flex-col bg-white"
        style={{ width: 'min(480px, 100vw)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)' }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FileText style={{ width: 13, height: 13, color: '#2563EB', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {source.type === 'note' ? 'Note' : 'Document'}
              </span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', margin: 0, lineHeight: 1.35 }}>
              {source.title ?? (source.type === 'note' ? 'Note' : source.file_name ?? 'Document')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
              {source.date && <span style={{ fontSize: 12, color: '#9B9B9B' }}>{fmtD(source.date)}</span>}
              {source.author && <span style={{ fontSize: 12, color: '#9B9B9B' }}>par {source.author}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E5E5', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X style={{ width: 15, height: 15, color: '#6B6B6B' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {excerpt ? (
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{excerpt}</p>
          ) : (
            <p style={{ fontSize: 14, color: '#9B9B9B' }}>Aucun extrait disponible.</p>
          )}
        </div>

        {source.account_id && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E5E5' }}>
            <button
              onClick={() => { onClose(); router.push(`/app/accounts/${source.account_id}`) }}
              style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#2563EB', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}
            >
              Voir la fiche client →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Sources pills ──

function SourcesList({ sources, chunks, onOpen }: {
  sources: SearchSource[]; chunks: ChunkUsed[]
  onOpen: (source: SearchSource, chunks: ChunkUsed[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? sources : sources.slice(0, 4)
  const extra = sources.length - 4

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 11, color: '#9B9B9B', margin: '0 0 6px' }}>Sources</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {visible.map((s, si) => (
          <button
            key={si}
            onClick={() => onOpen(s, chunks)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 20,
              background: '#F5F5F5', border: 'none',
              fontSize: 12, color: '#6B6B6B', cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#E5E5E5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#F5F5F5')}
          >
            <FileText style={{ width: 11, height: 11, flexShrink: 0 }} />
            {s.title ?? (s.type === 'note' ? `note du ${fmt(s.date)}` : s.file_name ?? 'doc')}
          </button>
        ))}
        {!expanded && extra > 0 && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              padding: '4px 12px', borderRadius: 20,
              background: '#F5F5F5', border: 'none',
              fontSize: 12, color: '#6B6B6B', cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#E5E5E5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#F5F5F5')}
          >
            + {extra} autre{extra > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Auto-resize helper ──

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// ── Hardcoded suggestion cards ──

const SUGGESTIONS = [
  'Résume les dernières notes de la semaine',
  "Quels clients n'ont pas été contactés ce mois ?",
  'Prépare-moi un brief avant un RDV',
]

function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { wsId, currentWorkspace } = useWorkspace()

  const [activeTab, setActiveTab] = useState<SearchTab>('global')
  const [portfolioAccounts, setPortfolioAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [globalAccountIds, setGlobalAccountIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [conversation, setConversation] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const [conversations, setConversations] = useState<ConvRow[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [previousChunks, setPreviousChunks] = useState<ChunkUsed[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSource, setDrawerSource] = useState<SearchSource | null>(null)
  const [drawerChunks, setDrawerChunks] = useState<ChunkUsed[]>([])

  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
  const [confirmDeleteMsgIndex, setConfirmDeleteMsgIndex] = useState<number | null>(null)

  const openSourceDrawer = useCallback((source: SearchSource, chunks: ChunkUsed[]) => {
    setDrawerSource(source)
    setDrawerChunks(chunks)
    setDrawerOpen(true)
  }, [])

  const [isRecording, setIsRecording] = useState(false)
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null)
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const didAutoSearch = useRef(false)

  const inConversation = conversation.length > 0 || loading

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setQuery(q)
  }, [searchParams])

  useEffect(() => {
    if (profileLoading || !profile) return
    const supabase = createClient()
    supabase
      .from('portfolio')
      .select('account_id, accounts(id, name)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        type Row = { accounts: { id: string; name: string } | null }
        const accs = ((data ?? []) as unknown as Row[])
          .map((e) => e.accounts).filter(Boolean) as { id: string; name: string }[]
        setPortfolioAccounts(accs)
      })
    if (profile.role === 'admin') {
      let q = supabase.from('accounts').select('id').eq('company_id', profile.company_id)
      if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      q.then(({ data }) => setGlobalAccountIds((data ?? []).map((a: { id: string }) => a.id)))
    } else {
      getAccessibleAccountIds(supabase, profile.id, profile.company_id, wsId).then(setGlobalAccountIds)
    }
  }, [profileLoading, profile, wsId])

  useEffect(() => {
    if (profileLoading || !profile) return
    fetch('/api/search/cleanup').catch(() => {})
    const supabase = createClient()
    let q = supabase
      .from('search_conversations')
      .select('id, title, messages, updated_at, expires_at, created_at')
      .eq('user_id', profile.id)
      .gt('expires_at', new Date().toISOString())
      .order('updated_at', { ascending: false })
    if (wsId) { q = q.eq('workspace_id', wsId) } else { q = q.is('workspace_id', null) }
    q.then(({ data }) => {
      const rows = ((data ?? []) as unknown[]).map((r) => {
        const row = r as Record<string, unknown>
        return {
          id: row.id as string, title: row.title as string | null,
          messages: (row.messages as Message[]) ?? [],
          updated_at: row.updated_at as string, expires_at: row.expires_at as string,
          created_at: row.created_at as string,
        } satisfies ConvRow
      })
      setConversations(rows)
      const qParam = searchParams.get('q')
      if (!qParam && rows.length > 0) {
        const first = rows[0]
        setActiveConversationId(first.id)
        setConversation(first.messages)
        const lastAss = [...first.messages].reverse().find(m => m.role === 'assistant')
        setPreviousChunks(lastAss?.chunks ?? [])
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, profile, wsId])

  useEffect(() => {
    if (inConversation) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [conversation.length, loading, inConversation])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !profile) return
    setLoading(true)
    const history = conversation.map(m => ({ role: m.role, content: m.content }))
    const userMsg: Message = { role: 'user', content: q, timestamp: new Date().toISOString() }
    const convWithUser = [...conversation, userMsg]
    setConversation(convWithUser)
    setInput('')
    setTimeout(() => { autoResize(mobileTextareaRef.current); autoResize(desktopTextareaRef.current) }, 0)

    const supabase = createClient()
    let convId = activeConversationId
    if (!convId) {
      const { data: newConv } = await supabase
        .from('search_conversations')
        .insert({ user_id: profile.id, workspace_id: wsId ?? null, title: q.slice(0, 40).trim(), messages: [] })
        .select('id, expires_at, updated_at, created_at').single()
      if (newConv) {
        const nc = newConv as { id: string; expires_at: string; updated_at: string; created_at: string }
        convId = nc.id
        setActiveConversationId(convId)
        setConversations(prev => [{ id: nc.id, title: q.slice(0, 40).trim(), messages: [], updated_at: nc.updated_at, expires_at: nc.expires_at, created_at: nc.created_at }, ...prev])
      }
    }

    try {
      const body: Record<string, unknown> = {
        query: q, company_id: profile.company_id,
        workspace_id: wsId ?? undefined, history, previousChunks,
      }
      if (activeTab === 'portfolio') {
        body[selectedAccountId ? 'account_id' : 'account_ids'] = selectedAccountId || portfolioAccounts.map((a) => a.id)
      } else {
        body.account_ids = globalAccountIds
      }
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      const chunks = (data.chunksUsed ?? []) as ChunkUsed[]
      const assistantMsg: Message = { role: 'assistant', content: data.answer ?? '', sources: data.sources ?? [], chunks, timestamp: new Date().toISOString() }
      const finalConv = [...convWithUser, assistantMsg]
      setConversation(finalConv)
      setPreviousChunks(chunks)
      if (convId) {
        const now = new Date().toISOString()
        await supabase.from('search_conversations').update({ messages: finalConv, updated_at: now }).eq('id', convId)
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: finalConv, updated_at: now } : c))
      }
    } catch {
      setConversation(prev => [...prev, { role: 'assistant', content: 'Une erreur est survenue. Veuillez réessayer.', sources: [], timestamp: new Date().toISOString() }])
    }
    setLoading(false)
  }, [profile, wsId, conversation, activeTab, selectedAccountId, portfolioAccounts, globalAccountIds, activeConversationId, previousChunks])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !didAutoSearch.current && !profileLoading && profile && portfolioAccounts.length > 0) {
      didAutoSearch.current = true
      doSearch(q)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, profileLoading, profile, portfolioAccounts])

  const handleNewConversation = () => {
    setActiveConversationId(null)
    setConversation([])
    setPreviousChunks([])
    setInput('')
    setQuery('')
  }

  const handleSelectConversation = useCallback((id: string) => {
    setConversations(prev => {
      const conv = prev.find(c => c.id === id)
      if (!conv) return prev
      setActiveConversationId(conv.id)
      setConversation(conv.messages)
      const lastAss = [...conv.messages].reverse().find(m => m.role === 'assistant')
      setPreviousChunks(lastAss?.chunks ?? [])
      setInput('')
      return prev
    })
  }, [])

  const doDeleteConversation = async (id: string) => {
    const supabase = createClient()
    await supabase.from('search_conversations').delete().eq('id', id)
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== id)
      if (activeConversationId === id) {
        if (remaining.length > 0) {
          const next = remaining[0]
          setActiveConversationId(next.id)
          setConversation(next.messages)
          const lastAss = [...next.messages].reverse().find(m => m.role === 'assistant')
          setPreviousChunks(lastAss?.chunks ?? [])
        } else {
          setActiveConversationId(null)
          setConversation([])
          setPreviousChunks([])
        }
      }
      return remaining
    })
    setConfirmDeleteId(null)
  }

  const doDeleteMessagePair = async (userMsgIndex: number) => {
    if (!activeConversationId) return
    const endIdx = conversation[userMsgIndex + 1]?.role === 'assistant' ? userMsgIndex + 2 : userMsgIndex + 1
    const snapshot = conversation
    const newConv = [...conversation.slice(0, userMsgIndex), ...conversation.slice(endIdx)]
    setConversation(newConv)
    setConfirmDeleteMsgIndex(null)
    const supabase = createClient()
    if (newConv.length === 0) {
      await supabase.from('search_conversations').delete().eq('id', activeConversationId)
      setConversations(prev => prev.filter(c => c.id !== activeConversationId))
      setActiveConversationId(null)
      setPreviousChunks([])
    } else {
      const now = new Date().toISOString()
      const { error } = await supabase.from('search_conversations').update({ messages: newConv, updated_at: now }).eq('id', activeConversationId)
      if (error) { setConversation(snapshot); return }
      setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, messages: newConv, updated_at: now } : c))
      const lastAss = [...newConv].reverse().find(m => m.role === 'assistant')
      setPreviousChunks(lastAss?.chunks ?? [])
    }
  }

  const handleSubmit = () => {
    const q = input.trim()
    if (!q || loading) return
    setQuery(q)
    doSearch(q)
  }

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'fr-FR'; r.continuous = false; r.interimResults = false
    r.onresult = (e: SpeechRecognitionEvent) => { setInput(e.results[0][0].transcript); setIsRecording(false) }
    r.onerror = () => setIsRecording(false)
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
    r.start(); setIsRecording(true)
  }, [])
  const stopVoice = () => { recognitionRef.current?.stop(); setIsRecording(false) }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    autoResize(e.target)
  }

  // ── Input area (shared render function) ──
  const inputArea = (textareaRef: React.RefObject<HTMLTextAreaElement | null>, isMobile: boolean) => (
    <div>
      <div style={{
        background: '#F9FAFB',
        border: '1px solid #E5E5E5',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '12px 16px',
        gap: 8,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#2563EB'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#E5E5E5'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder="Envoyer un message..."
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: isMobile ? 16 : 15,
            color: '#1A1A2E',
            lineHeight: 1.5,
            minHeight: 24,
            maxHeight: 200,
            overflowY: 'auto',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={isRecording ? stopVoice : startVoice}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.12s',
              color: isRecording ? '#EF4444' : '#6B6B6B',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F5F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {isRecording
              ? <MicOff style={{ width: 18, height: 18 }} />
              : <Mic style={{ width: 18, height: 18 }} />}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: 'none',
              background: input.trim() && !loading ? '#2563EB' : '#E5E5E5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            <ArrowUp style={{ width: 18, height: 18, color: input.trim() && !loading ? 'white' : '#9B9B9B' }} />
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#9B9B9B', textAlign: 'center', marginTop: 8 }}>
        Maimoo peut faire des erreurs. Vérifiez les informations importantes.
      </p>
    </div>
  )

  // ── Tabs + filters bar ──
  const tabsBar = (
    <div style={{
      flexShrink: 0,
      background: '#F9FAFB',
      borderBottom: '1px solid #E5E5E5',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 0,
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 20, flex: 1, alignItems: 'center' }}>
        <button
          onClick={() => setHistoryDrawerOpen(true)}
          className="hidden md:flex"
          style={{
            alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 8, border: '1px solid #E5E5E5',
            background: 'white', cursor: 'pointer',
            fontSize: 12, color: '#6B6B6B', flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.color = '#2563EB' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.color = '#6B6B6B' }}
        >
          <Menu style={{ width: 13, height: 13 }} />
          Historique
        </button>
        {([
          { value: 'portfolio' as const, label: 'Mon portefeuille', icon: Briefcase },
          { value: 'global' as const, label: 'Portefeuille global', icon: Globe },
        ]).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 0',
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13,
              color: activeTab === value ? '#2563EB' : '#6B6B6B',
              fontWeight: activeTab === value ? 500 : 400,
              borderBottom: activeTab === value ? '2px solid #2563EB' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <Icon style={{ width: 13, height: 13 }} />
            {label}
          </button>
        ))}
      </div>

    </div>
  )

  // ── Portfolio dropdown ──
  const portfolioDropdown = activeTab === 'portfolio' ? (
    <div style={{
      flexShrink: 0, padding: '8px 24px',
      borderBottom: '0.5px solid #E5E5E5', background: 'white',
      position: 'relative',
    }}>
      <Building2 style={{
        position: 'absolute', left: 34, top: '50%', transform: 'translateY(-50%)',
        width: 14, height: 14, color: '#9B9B9B', pointerEvents: 'none',
      }} />
      <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}
        style={{
          width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
          borderRadius: 8, border: '1px solid #E5E5E5', fontSize: 13, color: '#0A0A0A',
          background: 'white', outline: 'none', cursor: 'pointer',
        }}>
        <option value="">Toutes mes entreprises</option>
        {portfolioAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  ) : null

  // ── Messages list (grouped pairs) ──
  const messagePairs: Array<{ userIdx: number; assIdx: number | null }> = []
  {
    let i = 0
    while (i < conversation.length) {
      if (conversation[i].role === 'user') {
        const assIdx = conversation[i + 1]?.role === 'assistant' ? i + 1 : null
        messagePairs.push({ userIdx: i, assIdx })
        i += assIdx !== null ? 2 : 1
      } else { i++ }
    }
  }

  const messagesList = (
    <>
      {messagePairs.map(({ userIdx, assIdx }) => {
        const userMsg = conversation[userIdx]
        const assMsg = assIdx !== null ? conversation[assIdx] : null
        return (
          <div key={userIdx} className="group relative" style={{ marginBottom: 32 }}>
            <button
              onClick={() => setConfirmDeleteMsgIndex(userIdx)}
              title="Supprimer cet échange"
              className="opacity-30 md:opacity-0 md:group-hover:opacity-100 transition-opacity absolute top-0 right-0"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, zIndex: 2 }}
            >
              <Trash2 style={{ width: 14, height: 14, color: '#9B9B9B' }} />
            </button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <div style={{
                background: '#2563EB', color: 'white',
                borderRadius: '18px 18px 4px 18px',
                padding: '12px 18px', maxWidth: '65%',
                fontSize: 15, lineHeight: 1.5,
              }}>
                {userMsg.content}
              </div>
            </div>
            {assMsg && (
              <div style={{ maxWidth: '100%' }}>
                {renderMarkdown(assMsg.content)}
                {assMsg.sources && assMsg.sources.length > 0 && <SourcesList sources={assMsg.sources} chunks={assMsg.chunks ?? []} onOpen={openSourceDrawer} />}
              </div>
            )}
          </div>
        )
      })}
      {loading && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ height: 14, background: '#EFF6FF', borderRadius: 6, width: 200, animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 14, background: '#EFF6FF', borderRadius: 6, width: 280, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.15s' }} />
            <div style={{ height: 14, background: '#EFF6FF', borderRadius: 6, width: 240, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.3s' }} />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </>
  )

  // ── Empty state ──
  const emptyState = (isMobile: boolean) => (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '32px 20px' : '48px 32px',
      gap: 0,
    }}>
      {/* Logo */}
      <img src="/logo.png" alt="Maimoo" style={{ height: 36, width: 'auto', marginBottom: 24 }} />

      <h2 style={{
        fontSize: isMobile ? 22 : 28,
        fontWeight: 600, color: '#1A1A2E',
        textAlign: 'center', margin: '0 0 8px',
      }}>
        Comment puis-je vous aider ?
      </h2>
      <p style={{
        fontSize: 15, color: '#6B6B6B',
        textAlign: 'center', margin: '0 0 32px',
        maxWidth: 440, lineHeight: 1.5,
      }}>
        Posez une question sur vos clients, notes ou documents.
      </p>

      {/* Suggestion cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 12,
        width: '100%',
        maxWidth: 680,
      }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => doSearch(s)}
            style={{
              background: '#F9FAFB',
              border: '1px solid #E5E5E5',
              borderRadius: 12,
              padding: '16px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13, color: '#0A0A0A',
              lineHeight: 1.5,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F5F5F5'
              e.currentTarget.style.borderColor = '#D1D5DB'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#F9FAFB'
              e.currentTarget.style.borderColor = '#E5E5E5'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col" style={{ height: 'calc(100dvh - 4rem)', background: 'white' }}>

        {/* Mobile header — burger (from MobileSidebar) is fixed at left-3(12px), 40px wide → 56px spacer */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '12px 16px',
          paddingLeft: 56,
          background: 'white', borderBottom: '1px solid #E5E5E5',
        }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#1A1A2E' }}>
            Recherche IA
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={{
                position: 'relative', width: 36, height: 36, borderRadius: 8,
                background: 'transparent', border: '1px solid #E5E5E5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <History style={{ width: 16, height: 16, color: '#0A0A0A' }} />
              {conversations.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  minWidth: 16, height: 16, borderRadius: 8, background: '#2563EB',
                  color: 'white', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {conversations.length > 9 ? '9+' : conversations.length}
                </span>
              )}
            </button>
            <button onClick={() => router.push('/app/import')}
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'transparent', border: '1px solid #E5E5E5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}>
              <Upload style={{ width: 16, height: 16, color: '#6B6B6B' }} />
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div style={{
          flexShrink: 0,
          background: '#F9FAFB',
          borderBottom: '1px solid #E5E5E5',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          {(['portfolio', 'global'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13,
                color: activeTab === tab ? '#2563EB' : '#6B6B6B',
                fontWeight: activeTab === tab ? 500 : 400,
                borderBottom: activeTab === tab ? '2px solid #2563EB' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
              {tab === 'portfolio' ? 'Mon portefeuille' : 'Portefeuille global'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {inConversation ? (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
              {messagesList}
            </div>
          ) : (
            emptyState(true)
          )}
        </div>

        {/* Mobile input */}
        <div style={{
          flexShrink: 0, background: 'white',
          borderTop: '1px solid #E5E5E5',
          padding: '12px 16px',
          paddingBottom: 'max(12px, calc(env(safe-area-inset-bottom, 0px) + 12px))',
        }}>
          {inputArea(mobileTextareaRef, true)}
        </div>
      </div>

      {/* Mobile history bottom-sheet */}
      <div
        className="md:hidden fixed inset-0 z-[60]"
        style={{
          background: mobileSidebarOpen ? 'rgba(0,0,0,0.4)' : 'transparent',
          pointerEvents: mobileSidebarOpen ? 'auto' : 'none',
          transition: 'background 0.25s',
        }}
        onClick={() => setMobileSidebarOpen(false)}
      >
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '70vh',
            background: 'white',
            borderRadius: '20px 20px 0 0',
            display: 'flex', flexDirection: 'column',
            transform: mobileSidebarOpen ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.25s ease-out',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E5E5E5' }} />
          </div>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px 8px', borderBottom: '1px solid #E5E5E5', flexShrink: 0,
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A' }}>Historique</span>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}
            >
              <X style={{ width: 18, height: 18, color: '#6B6B6B' }} />
            </button>
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <ConversationsSidebar
              conversations={conversations}
              activeId={activeConversationId}
              workspaceName={currentWorkspace?.name}
              mobileMode
              light
              onNew={() => { handleNewConversation(); setMobileSidebarOpen(false) }}
              onSelect={(id) => { handleSelectConversation(id); setMobileSidebarOpen(false) }}
              onDelete={(id) => { setConfirmDeleteId(id); setMobileSidebarOpen(false) }}
            />
          </div>
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* History drawer overlay */}
        {historyDrawerOpen && (
          <div
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setHistoryDrawerOpen(false)}
          />
        )}
        <div
          className="fixed top-0 left-[200px] bottom-0 z-[60] hidden md:flex flex-col"
          style={{
            width: 280,
            transform: historyDrawerOpen ? 'translateX(0)' : 'translateX(calc(-280px - 200px))',
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <ConversationsSidebar
            conversations={conversations}
            activeId={activeConversationId}
            workspaceName={currentWorkspace?.name}
            onNew={() => { handleNewConversation(); setHistoryDrawerOpen(false) }}
            onSelect={(id) => { handleSelectConversation(id); setHistoryDrawerOpen(false) }}
            onDelete={(id) => { setConfirmDeleteId(id); setHistoryDrawerOpen(false) }}
          />
        </div>

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'white' }}>

          {/* Tabs + filters bar */}
          {tabsBar}
          {portfolioDropdown}

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'white' }}>
            {inConversation ? (
              <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px' }}>
                {messagesList}
              </div>
            ) : (
              emptyState(false)
            )}
          </div>

          {/* Input bar */}
          <div style={{
            flexShrink: 0,
            background: 'white',
            borderTop: '1px solid #E5E5E5',
            padding: '16px 24px',
          }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {inputArea(desktopTextareaRef, false)}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            style={{
              background: 'white', borderRadius: 16, padding: 24,
              maxWidth: 360, width: 'calc(100% - 32px)',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>
              Supprimer cette conversation ?
            </h3>
            <p style={{ fontSize: 14, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10,
                  border: '1px solid #E2E8F0', background: 'white',
                  color: '#0A0A0A', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => doDeleteConversation(confirmDeleteId)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10,
                  border: 'none', background: '#EF4444',
                  color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message delete confirmation */}
      {confirmDeleteMsgIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmDeleteMsgIndex(null)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 360, width: 'calc(100% - 32px)', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>Supprimer ce message ?</h3>
            <p style={{ fontSize: 14, color: '#64748B', margin: 0, lineHeight: 1.5 }}>Cette action est irréversible.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setConfirmDeleteMsgIndex(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', color: '#0A0A0A', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => doDeleteMessagePair(confirmDeleteMsgIndex)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#EF4444', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <SourceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        source={drawerSource}
        chunks={drawerChunks}
      />
    </>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  )
}

'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Briefcase, Globe, Building2, Upload, Sparkles, Mic, MicOff, ArrowUp, FileText, MessageCircle } from 'lucide-react'
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
type StatusFilter = 'all' | 'client' | 'prospect'
type Message = { role: 'user' | 'assistant'; content: string; sources?: SearchSource[]; chunks?: ChunkUsed[]; timestamp?: string }

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

function parseAIContent(content: string): React.ReactNode {
  const lines = content.split('\n')
  const items: string[] = []
  let current = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('– ')) {
      if (current) items.push(current.trim())
      current = trimmed.slice(2)
    } else if (trimmed && current) {
      current += ' ' + trimmed
    } else if (!trimmed && current) {
      items.push(current.trim())
      current = ''
    }
  }
  if (current) items.push(current.trim())

  if (items.length <= 1) {
    return <p style={{ lineHeight: 1.7, margin: 0, fontSize: 14, color: '#1A1A2E' }}>{content}</p>
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < items.length - 1 ? 10 : 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4C6EF5', flexShrink: 0, marginTop: 7 }} />
          <span style={{ lineHeight: 1.7, fontSize: 14, color: '#1A1A2E' }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SourcesList({ sources }: { sources: SearchSource[] }) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const visible = expanded ? sources : sources.slice(0, 5)
  const extra = sources.length - 5

  const handleClick = async (s: SearchSource) => {
    if (s.type === 'note' && s.account_id) {
      router.push(`/app/accounts/${s.account_id}`)
    } else if (s.type === 'document') {
      if (s.url) { window.open(s.url, '_blank'); return }
      const res = await fetch(`/api/documents/${s.id}/url`).catch(() => null)
      if (res?.ok) {
        const { url } = await res.json()
        if (url) window.open(url, '_blank')
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {visible.map((s, si) => (
        <button
          key={si}
          onClick={() => handleClick(s)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: 'white', border: '0.5px solid #E5E7EB',
            fontSize: 11, color: '#8899BB', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F4FF')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
        >
          <FileText style={{ width: 11, height: 11, flexShrink: 0 }} />
          {s.title ?? (s.type === 'note' ? `note du ${fmt(s.date)}` : s.file_name ?? 'doc')}
        </button>
      ))}
      {!expanded && extra > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            padding: '3px 10px', borderRadius: 20,
            background: 'white', border: '0.5px solid #E5E7EB',
            fontSize: 11, color: '#4C6EF5', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F4FF')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
        >
          + {extra} autre{extra > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { wsId } = useWorkspace()

  const [activeTab, setActiveTab] = useState<SearchTab>('global')
  const [portfolioAccounts, setPortfolioAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [globalAccountIds, setGlobalAccountIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [city, setCity] = useState('')

  const [query, setQuery] = useState('')
  const [conversation, setConversation] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)

  const [conversations, setConversations] = useState<ConvRow[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [previousChunks, setPreviousChunks] = useState<ChunkUsed[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const desktopInputRef = useRef<HTMLInputElement>(null)
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

    if (wsId) {
      q = q.eq('workspace_id', wsId)
    } else {
      q = q.is('workspace_id', null)
    }

    q.then(({ data }) => {
      const rows = ((data ?? []) as unknown[]).map((r) => {
        const row = r as Record<string, unknown>
        return {
          id: row.id as string,
          title: row.title as string | null,
          messages: (row.messages as Message[]) ?? [],
          updated_at: row.updated_at as string,
          expires_at: row.expires_at as string,
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

    const supabase = createClient()
    let convId = activeConversationId

    if (!convId) {
      const { data: newConv } = await supabase
        .from('search_conversations')
        .insert({
          user_id: profile.id,
          workspace_id: wsId ?? null,
          title: q.slice(0, 40).trim(),
          messages: [],
        })
        .select('id, expires_at, updated_at, created_at')
        .single()
      if (newConv) {
        const nc = newConv as { id: string; expires_at: string; updated_at: string; created_at: string }
        convId = nc.id
        setActiveConversationId(convId)
        setConversations(prev => [{
          id: nc.id,
          title: q.slice(0, 40).trim(),
          messages: [],
          updated_at: nc.updated_at,
          expires_at: nc.expires_at,
          created_at: nc.created_at,
        }, ...prev])
      }
    }

    try {
      const body: Record<string, unknown> = {
        query: q, company_id: profile.company_id,
        workspace_id: wsId ?? undefined, status: statusFilter,
        city: city.trim() || undefined, history,
        previousChunks,
      }
      if (activeTab === 'portfolio') {
        body[selectedAccountId ? 'account_id' : 'account_ids'] = selectedAccountId || portfolioAccounts.map((a) => a.id)
      } else {
        body.account_ids = globalAccountIds
      }
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()

      const chunks = (data.chunksUsed ?? []) as ChunkUsed[]
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer ?? '',
        sources: data.sources ?? [],
        chunks,
        timestamp: new Date().toISOString(),
      }

      const finalConv = [...convWithUser, assistantMsg]
      setConversation(finalConv)
      setPreviousChunks(chunks)

      if (convId) {
        const now = new Date().toISOString()
        await supabase
          .from('search_conversations')
          .update({ messages: finalConv, updated_at: now })
          .eq('id', convId)
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, messages: finalConv, updated_at: now } : c
        ))
      }
    } catch {
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: 'Une erreur est survenue. Veuillez réessayer.',
        sources: [],
        timestamp: new Date().toISOString(),
      }])
    }
    setLoading(false)
  }, [profile, wsId, conversation, activeTab, selectedAccountId, portfolioAccounts, globalAccountIds, statusFilter, city, activeConversationId, previousChunks])

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

  const handleSubmit = () => { const q = input.trim(); if (!q || loading) return; setQuery(q); doSearch(q) }

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

  // ── Input bars ──

  const inputBarSmall = (inputRef: React.RefObject<HTMLInputElement | null>) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
        background: '#F5F7FA', border: inputFocused ? '1.5px solid #4C6EF5' : '1.5px solid #E5E7EB',
        borderRadius: 14, height: 52, padding: '0 14px',
        boxShadow: inputFocused ? '0 0 0 3px rgba(76,110,245,0.10)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        <input
          ref={inputRef} type="text"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#1A1A2E' }}
          placeholder="Poser une question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
        />
        <button
          onClick={isRecording ? stopVoice : startVoice}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: isRecording ? '#EF4444' : '#4C6EF5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}>
          {isRecording ? <MicOff style={{ width: 16, height: 16, color: 'white' }} /> : <Mic style={{ width: 16, height: 16, color: 'white' }} />}
        </button>
        <button
          onClick={handleSubmit} disabled={loading}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: input.trim() && !loading ? '#1E2761' : '#CBD5E1',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s',
          }}>
          <ArrowUp style={{ width: 16, height: 16, color: 'white' }} />
        </button>
      </div>
    </div>
  )

  const inputBarLarge = (inputRef: React.RefObject<HTMLInputElement | null>) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'white', border: '1.5px solid #4C6EF5',
      borderRadius: 16, height: 56, padding: '0 16px',
      boxShadow: '0 0 0 4px rgba(76,110,245,0.08)',
    }}>
      <input
        ref={inputRef} type="text"
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: '#1A1A2E' }}
        placeholder="Posez votre question..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
      />
      <button
        onClick={isRecording ? stopVoice : startVoice}
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none',
          background: isRecording ? '#EF4444' : '#4C6EF5',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }}>
        {isRecording ? <MicOff style={{ width: 17, height: 17, color: 'white' }} /> : <Mic style={{ width: 17, height: 17, color: 'white' }} />}
      </button>
      <button
        onClick={handleSubmit} disabled={loading}
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none',
          background: input.trim() && !loading ? '#1E2761' : '#CBD5E1',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s',
        }}>
        <ArrowUp style={{ width: 17, height: 17, color: 'white' }} />
      </button>
    </div>
  )

  // ── Suggestions ──
  const firstAccount = portfolioAccounts[0]?.name
  const suggestions = [
    firstAccount ? `Dernier contact avec ${firstAccount} ?` : 'Quand ai-je contacté ce client pour la dernière fois ?',
    "Quels clients n'ont pas été contactés ce mois ?",
    'Résume les notes de la semaine',
  ]

  // ── Pill tabs (desktop) ──
  const pillTabs = (
    <div style={{ display: 'inline-flex', background: '#F0F4FF', borderRadius: 10, padding: 3, gap: 2 }}>
      {([
        { value: 'portfolio' as const, label: 'Mon portefeuille', icon: Briefcase },
        { value: 'global' as const, label: 'Portefeuille global', icon: Globe },
      ]).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setActiveTab(value)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeTab === value ? 500 : 400,
            background: activeTab === value ? 'white' : 'transparent',
            color: activeTab === value ? '#1E2761' : '#8899BB',
            boxShadow: activeTab === value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <Icon style={{ width: 13, height: 13 }} />
          {label}
        </button>
      ))}
    </div>
  )

  // ── Status filters ──
  const statusFilters = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {(['all', 'client', 'prospect'] as const).map((f) => (
        <button
          key={f}
          onClick={() => setStatusFilter(f)}
          style={{
            padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 400,
            background: statusFilter === f ? '#1E2761' : 'transparent',
            color: statusFilter === f ? 'white' : '#8899BB',
            outline: statusFilter === f ? 'none' : '1px solid #E5E7EB',
            transition: 'all 0.15s',
          }}
        >
          {f === 'all' ? 'Tous' : f === 'client' ? 'Clients' : 'Prospects'}
        </button>
      ))}
      <input
        type="text" value={city} onChange={(e) => setCity(e.target.value)}
        placeholder="Ville..."
        style={{
          padding: '6px 10px', borderRadius: 8,
          border: '1px solid #E5E7EB', fontSize: 12, color: '#374151',
          width: 76, background: 'white', outline: 'none',
        }}
      />
    </div>
  )

  // ── Messages ──
  const conversationMessages = (
    <>
      {conversation.map((msg, i) => {
        if (msg.role === 'user') return (
          <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              background: '#1E2761', color: 'white',
              borderRadius: '16px 16px 4px 16px',
              padding: '12px 18px', maxWidth: '70%',
              fontSize: 14, lineHeight: 1.6,
            }}>
              {msg.content}
            </div>
          </div>
        )
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '80%' }}>
            <div style={{ fontSize: 14, color: '#1A1A2E', lineHeight: 1.7 }}>
              {parseAIContent(msg.content)}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <SourcesList sources={msg.sources} />
            )}
          </div>
        )
      })}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '80%', gap: 8 }}>
          <div style={{ height: 14, background: '#E8ECFF', borderRadius: 6, width: 140, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ height: 14, background: '#E8ECFF', borderRadius: 6, width: 200, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.15s' }} />
          <div style={{ height: 14, background: '#E8ECFF', borderRadius: 6, width: 165, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.3s' }} />
        </div>
      )}
      <div ref={bottomRef} />
    </>
  )

  return (
    <>
      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col" style={{ height: '100dvh', background: '#F8F9FF' }}>

        {/* Mobile header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px 12px 68px',
          background: 'white',
          borderBottom: '0.5px solid #E5E7EB',
          flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: '#1E2761' }}>Recherche IA</span>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#F0F4FF', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <MessageCircle style={{ width: 16, height: 16, color: '#4C6EF5' }} />
          </button>
          <button
            onClick={() => router.push('/app/import')}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#F0F4FF', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Upload style={{ width: 15, height: 15, color: '#4C6EF5' }} />
          </button>
        </div>

        {/* Mobile tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          padding: '10px 16px',
          background: 'white', borderBottom: '0.5px solid #E5E7EB', flexShrink: 0,
        }}>
          <div style={{ display: 'inline-flex', background: '#F0F4FF', borderRadius: 8, padding: 2, gap: 1 }}>
            {(['portfolio', 'global'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: activeTab === tab ? 500 : 400,
                  background: activeTab === tab ? 'white' : 'transparent',
                  color: activeTab === tab ? '#1E2761' : '#8899BB',
                  boxShadow: activeTab === tab ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s',
                }}>
                {tab === 'portfolio' ? 'Mon portefeuille' : 'Portefeuille global'}
              </button>
            ))}
          </div>
        </div>

        {inConversation ? (
          <>
            <div style={{
              flex: 1, overflowY: 'auto', minHeight: 0,
              padding: '20px 16px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {conversationMessages}
            </div>
            <div style={{
              flexShrink: 0, background: 'white', padding: '12px 16px',
              borderTop: '0.5px solid #E5E7EB',
              paddingBottom: 'max(80px, calc(env(safe-area-inset-bottom, 0px) + 20px))',
            }}>
              {inputBarSmall(mobileInputRef)}
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '32px 24px', gap: 24,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(76,110,245,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Sparkles style={{ width: 28, height: 28, color: '#4C6EF5' }} />
              </div>
              <p style={{ fontSize: 19, fontWeight: 700, color: '#1E2761', margin: '0 0 8px' }}>
                Que voulez-vous savoir ?
              </p>
              <p style={{ fontSize: 13, color: '#8899BB', margin: 0, lineHeight: 1.6 }}>
                Posez une question sur n'importe quel client, note ou document.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => { setInput(s); setTimeout(() => doSearch(s), 0) }}
                  style={{
                    padding: '8px 16px', background: 'white',
                    border: '1px solid #E5E7EB', borderRadius: 24,
                    fontSize: 12, color: '#374151', cursor: 'pointer',
                  }}>
                  {s}
                </button>
              ))}
            </div>
            <div style={{ width: '100%' }}>
              {inputBarLarge(mobileInputRef)}
            </div>
          </div>
        )}
      </div>

      {/* Mobile conversations overlay */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            style={{ width: 280, height: '100%', background: '#0A1628' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ConversationsSidebar
              conversations={conversations}
              activeId={activeConversationId}
              onNew={() => { handleNewConversation(); setMobileSidebarOpen(false) }}
              onSelect={(id) => { handleSelectConversation(id); setMobileSidebarOpen(false) }}
              onDelete={(id) => { setConfirmDeleteId(id); setMobileSidebarOpen(false) }}
            />
          </div>
        </div>
      )}

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* Conversations sidebar */}
        <ConversationsSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onNew={handleNewConversation}
          onSelect={handleSelectConversation}
          onDelete={(id) => setConfirmDeleteId(id)}
        />

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'white' }}>

          {/* Header */}
          <div style={{
            flexShrink: 0,
            padding: '14px 24px',
            background: 'white',
            borderBottom: '0.5px solid #E5E7EB',
          }}>
            {/* Breadcrumb */}
            <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 6 }}>
              <span>MAIMOO</span>
              <span style={{ margin: '0 5px', color: '#CBD5E1' }}>/</span>
              <span>Recherche IA</span>
            </div>

            {/* Title */}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E2761', margin: '0 0 12px' }}>
              Recherche IA
            </h1>

            {/* Tabs + filters row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {pillTabs}
              <div style={{ flex: 1 }} />
              {statusFilters}
            </div>

            {/* Portfolio dropdown */}
            {activeTab === 'portfolio' && (
              <div style={{ marginTop: 10, position: 'relative' }}>
                <Building2 style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  width: 14, height: 14, color: '#94A3B8', pointerEvents: 'none',
                }} />
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  style={{
                    width: '100%', paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                    borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151',
                    background: 'white', outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="">Toutes mes entreprises</option>
                  {portfolioAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Conversation / Empty state */}
          {inConversation ? (
            <>
              <div style={{
                flex: 1, overflowY: 'auto',
                padding: '24px',
                background: '#F8F9FF',
              }}>
                <div style={{
                  maxWidth: 760, margin: '0 auto',
                  display: 'flex', flexDirection: 'column', gap: 20,
                }}>
                  {conversationMessages}
                </div>
              </div>
              <div style={{
                flexShrink: 0,
                background: 'white',
                borderTop: '0.5px solid #E5E7EB',
                padding: '16px 24px',
              }}>
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                  {inputBarSmall(desktopInputRef)}
                </div>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '48px 32px', gap: 32,
              background: '#F8F9FF',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'rgba(76,110,245,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <Sparkles style={{ width: 32, height: 32, color: '#4C6EF5' }} />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1E2761', margin: '0 0 10px' }}>
                  Que voulez-vous savoir ?
                </h2>
                <p style={{ fontSize: 14, color: '#8899BB', margin: 0, lineHeight: 1.6, maxWidth: 440 }}>
                  Posez une question sur n'importe quel client, note ou document de votre équipe.
                </p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); setTimeout(() => doSearch(s), 0) }}
                    style={{
                      padding: '9px 18px', background: 'white',
                      border: '1px solid #E5E7EB', borderRadius: 24,
                      fontSize: 13, color: '#374151', cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C6EF5'; e.currentTarget.style.background = '#F8F9FF' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = 'white' }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div style={{ width: '100%', maxWidth: 680 }}>
                {inputBarLarge(desktopInputRef)}
              </div>
            </div>
          )}
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
                  color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer',
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

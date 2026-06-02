'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Briefcase, Globe, Building2, RotateCcw, Upload, MessageSquare, Mic, MicOff, ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import type { SearchSource } from '@/types/database'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

type SearchTab = 'portfolio' | 'global'
type StatusFilter = 'all' | 'client' | 'prospect'
type Message = { role: 'user' | 'assistant'; content: string; sources?: SearchSource[] }

async function getAccessibleAccountIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string
): Promise<string[]> {
  const { data: entries } = await supabase
    .from('portfolio').select('id, account_id, user_id, visibility').eq('company_id', companyId)
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

function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()

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

  // Mobile voice state
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
      supabase.from('accounts').select('id').eq('company_id', profile.company_id)
        .then(({ data }) => setGlobalAccountIds((data ?? []).map((a: { id: string }) => a.id)))
    } else {
      getAccessibleAccountIds(supabase, profile.id, profile.company_id).then(setGlobalAccountIds)
    }
  }, [profileLoading, profile])

  useEffect(() => {
    if (inConversation) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [conversation.length, loading, inConversation])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !profile) return
    setLoading(true)

    const history = conversation.map(m => ({ role: m.role, content: m.content }))
    setConversation(prev => [...prev, { role: 'user', content: q }])
    setInput('')

    try {
      const body: Record<string, unknown> = {
        query: q,
        company_id: profile.company_id,
        status: statusFilter,
        city: city.trim() || undefined,
        history,
      }
      if (activeTab === 'portfolio') {
        body[selectedAccountId ? 'account_id' : 'account_ids'] = selectedAccountId || portfolioAccounts.map((a) => a.id)
      } else {
        body.account_ids = globalAccountIds
      }
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      setConversation(prev => [...prev, { role: 'assistant', content: data.answer ?? '', sources: data.sources ?? [] }])
    } catch {
      setConversation(prev => [...prev, { role: 'assistant', content: 'Une erreur est survenue. Veuillez réessayer.', sources: [] }])
    }
    setLoading(false)
  }, [profile, conversation, activeTab, selectedAccountId, portfolioAccounts, globalAccountIds, statusFilter, city])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !didAutoSearch.current && !profileLoading && profile && portfolioAccounts.length > 0) {
      didAutoSearch.current = true
      doSearch(q)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, profileLoading, profile, portfolioAccounts])

  const handleReset = () => {
    setConversation([])
    setInput('')
    setQuery('')
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
    r.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results[0][0].transcript
      setInput(t)
      setIsRecording(false)
    }
    r.onerror = () => setIsRecording(false)
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
    r.start()
    setIsRecording(true)
  }, [])

  const stopVoice = () => { recognitionRef.current?.stop(); setIsRecording(false) }

  const tabsBar = (
    <div
      className="flex shrink-0 px-3 py-2 bg-white gap-2 md:px-0 md:bg-transparent"
      style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}
    >
      {(['portfolio', 'global'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          style={activeTab === tab
            ? { background: '#1E2761', color: 'white' }
            : { background: '#F0F4FF', color: '#8899BB' }}
        >
          {tab === 'portfolio' ? 'Perso' : 'Global'}
        </button>
      ))}
      {activeTab === 'portfolio' && portfolioAccounts.length > 0 && (
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="ml-auto text-xs rounded-full px-2 py-1 focus:outline-none"
          style={{ background: '#F0F4FF', color: '#8899BB', border: 'none' }}
        >
          <option value="">Toutes</option>
          {portfolioAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
    </div>
  )

  const inputBar = (isMobile: boolean) => (
    <div
      className="shrink-0 px-3 py-2.5 bg-white md:px-6 md:py-3"
      style={{ borderTop: '1px solid #E5EAF5' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 md:max-w-2xl md:mx-auto"
        style={{ background: '#F5F7FA', borderRadius: 14, border: '1px solid #E5EAF5' }}
      >
        <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          ref={isMobile ? mobileInputRef : desktopInputRef}
          type="text"
          className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none"
          placeholder="Poser une question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          onClick={isRecording ? stopVoice : startVoice}
          className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{ background: isRecording ? '#EF4444' : '#4C6EF5' }}
        >
          {isRecording
            ? <MicOff className="w-3.5 h-3.5 text-white" />
            : <Mic className="w-3.5 h-3.5 text-white" />
          }
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 transition-all duration-150"
          style={{ background: input.trim() && !loading ? '#4C6EF5' : '#CBD5E1' }}
          aria-label="Envoyer"
        >
          <ArrowUp className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    </div>
  )

  const conversationMessages = (
    <>
      {inConversation && (
        <div className="flex justify-center">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#1E2761] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Nouvelle recherche
          </button>
        </div>
      )}

      {conversation.map((msg, i) => {
        if (msg.role === 'user') {
          return (
            <div key={i} className="flex justify-end">
              <div
                className="max-w-[85%] px-4 py-2.5 text-sm text-white leading-relaxed"
                style={{ background: '#4C6EF5', borderRadius: '12px 12px 4px 12px' }}
              >
                {msg.content}
              </div>
            </div>
          )
        }
        return (
          <div key={i} className="flex flex-col gap-1 items-start">
            <div
              className="max-w-[90%] px-4 py-3 text-sm text-[#2D3A5A] leading-relaxed"
              style={{ background: '#F5F7FF', borderRadius: '12px 12px 12px 4px' }}
            >
              {msg.content}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <p className="text-[9px] text-[#8899BB] px-1">
                Sources : {msg.sources.map((s) => s.title ?? (s.type === 'note' ? `note du ${fmt(s.date)}` : s.file_name ?? 'doc')).join(' · ')}
              </p>
            )}
          </div>
        )
      })}

      {loading && (
        <div className="flex flex-col gap-1 items-start">
          <div
            className="px-4 py-3 space-y-2"
            style={{ background: '#F5F7FF', borderRadius: '12px 12px 12px 4px', minWidth: 120 }}
          >
            <div className="h-2.5 bg-[#E8ECFF] rounded animate-pulse w-32" />
            <div className="h-2.5 bg-[#E8ECFF] rounded animate-pulse w-48" />
            <div className="h-2.5 bg-[#E8ECFF] rounded animate-pulse w-40" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </>
  )

  return (
    <>
      {/* ── MOBILE LAYOUT ── */}
      <div className="md:hidden flex flex-col" style={{ height: '100dvh' }}>

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 pl-14 py-3 bg-white shrink-0"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}
        >
          <span className="flex-1 text-[13px] font-bold text-[#0A1628]">Recherche IA</span>
          <button
            onClick={() => router.push('/app/import')}
            className="w-7 h-7 flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: '#F0F4FF', borderRadius: 8 }}
            title="Importer un fichier"
          >
            <Upload className="w-4 h-4 text-[#4C6EF5]" />
          </button>
        </div>

        {tabsBar}

        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
          {conversationMessages}
        </div>

        {inputBar(true)}
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 px-8 pt-6 pb-4 bg-[#F0F4FF]" style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
          <Breadcrumb items={[
            { label: 'MAIMOO', href: '/app/dashboard' },
            { label: 'Recherche IA' },
          ]} />

          <div className="flex items-center justify-between mt-3 mb-4">
            <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight">Recherche IA</h1>
            {inConversation && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#1E2761] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nouvelle recherche
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex mb-3" style={{ borderBottom: '1px solid rgba(30,39,97,0.10)' }}>
            {([
              { value: 'portfolio' as const, label: 'Mon portefeuille', icon: Briefcase },
              { value: 'global' as const, label: 'Portefeuille global', icon: Globe },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px"
                style={activeTab === value ? {
                  borderBottomColor: '#4C6EF5',
                  color: '#1E2761',
                } : {
                  borderBottomColor: 'transparent',
                  color: '#94A3B8',
                }}
              >
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {activeTab === 'portfolio' && (
            <div className="relative mb-3">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[#0F172A] focus:outline-none transition-all duration-200"
                style={{
                  background: 'rgba(240,244,255,0.8)',
                  border: '1px solid rgba(30,39,97,0.12)',
                }}
              >
                <option value="">Toutes mes entreprises</option>
                {portfolioAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'client', 'prospect'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150"
                style={statusFilter === f ? {
                  background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)',
                  color: 'white',
                } : {
                  background: 'white',
                  color: '#64748B',
                  border: '1px solid rgba(30,39,97,0.12)',
                }}
              >
                {f === 'all' ? 'Tous' : f === 'client' ? 'Clients' : 'Prospects'}
              </button>
            ))}
            <input
              type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville..."
              className="px-3 py-1.5 rounded-xl text-xs text-slate-600 placeholder-slate-400 focus:outline-none transition-all duration-200 w-24"
              style={{
                background: 'rgba(240,244,255,0.8)',
                border: '1px solid rgba(30,39,97,0.12)',
              }}
            />
          </div>
        </div>

        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {conversationMessages}
          </div>
        </div>

        {/* Permanent input bar */}
        {inputBar(false)}
      </div>
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

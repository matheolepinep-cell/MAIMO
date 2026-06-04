'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Briefcase, Globe, Building2, RotateCcw, Upload, Sparkles, Mic, MicOff, ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
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
    return <p style={{ lineHeight: 1.6, margin: 0 }}>{content}</p>
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < items.length - 1 ? 8 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4C6EF5', flexShrink: 0, marginTop: 5 }} />
          <span style={{ lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ul>
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
        query: q, company_id: profile.company_id,
        workspace_id: wsId ?? undefined, status: statusFilter,
        city: city.trim() || undefined, history,
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
  }, [profile, wsId, conversation, activeTab, selectedAccountId, portfolioAccounts, globalAccountIds, statusFilter, city])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !didAutoSearch.current && !profileLoading && profile && portfolioAccounts.length > 0) {
      didAutoSearch.current = true
      doSearch(q)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, profileLoading, profile, portfolioAccounts])

  const handleReset = () => { setConversation([]); setInput(''); setQuery('') }
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

  // Input bar — small (bottom, in conversation)
  const inputBarSmall = (inputRef: React.RefObject<HTMLInputElement | null>) => (
    <div
      className="flex items-center gap-2 transition-all duration-150"
      style={{
        background: '#F5F7FA', borderRadius: 14,
        border: inputFocused ? '1.5px solid #4C6EF5' : '1.5px solid #E5EAF5',
        boxShadow: inputFocused ? '0 0 0 3px rgba(76,110,245,0.15)' : 'none',
        padding: '0 14px', minHeight: 48,
      }}
    >
      <input
        ref={inputRef} type="text"
        className="flex-1 bg-transparent text-[#0F172A] placeholder-slate-400 focus:outline-none"
        style={{ fontSize: 14 }}
        placeholder="Poser une question..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
      />
      <button onClick={isRecording ? stopVoice : startVoice}
        className="rounded-full flex items-center justify-center shrink-0 transition-all"
        style={{ background: isRecording ? '#EF4444' : '#4C6EF5', width: 34, height: 34 }}>
        {isRecording ? <MicOff className="text-white" style={{ width: 16, height: 16 }} /> : <Mic className="text-white" style={{ width: 16, height: 16 }} />}
      </button>
      <button onClick={handleSubmit} disabled={loading}
        className="rounded-full flex items-center justify-center shrink-0 transition-all duration-150"
        style={{ background: input.trim() && !loading ? '#4C6EF5' : '#CBD5E1', width: 34, height: 34 }}>
        <ArrowUp className="text-white" style={{ width: 16, height: 16 }} />
      </button>
    </div>
  )

  // Input bar — large (empty state, centered)
  const inputBarLarge = (inputRef: React.RefObject<HTMLInputElement | null>) => (
    <div
      className="flex items-center gap-3 transition-all duration-150"
      style={{
        background: 'white', borderRadius: 16,
        border: '1.5px solid #4C6EF5',
        boxShadow: '0 0 0 4px rgba(76,110,245,0.08)',
        padding: '0 16px', height: 56,
      }}
    >
      <input
        ref={inputRef} type="text"
        className="flex-1 bg-transparent text-[#0F172A] placeholder-slate-400 focus:outline-none"
        style={{ fontSize: 15 }}
        placeholder="Posez votre question..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
      />
      <button onClick={isRecording ? stopVoice : startVoice}
        className="rounded-full flex items-center justify-center shrink-0 transition-all"
        style={{ background: isRecording ? '#EF4444' : '#4C6EF5', width: 36, height: 36 }}>
        {isRecording ? <MicOff className="text-white" style={{ width: 17, height: 17 }} /> : <Mic className="text-white" style={{ width: 17, height: 17 }} />}
      </button>
      <button onClick={handleSubmit} disabled={loading}
        className="rounded-full flex items-center justify-center shrink-0 transition-all duration-150"
        style={{ background: input.trim() && !loading ? '#4C6EF5' : '#CBD5E1', width: 36, height: 36 }}>
        <ArrowUp className="text-white" style={{ width: 17, height: 17 }} />
      </button>
    </div>
  )

  // Suggestions
  const firstAccount = portfolioAccounts[0]?.name
  const suggestions = [
    firstAccount ? `Dernier contact avec ${firstAccount} ?` : 'Quand ai-je contacté ce client pour la dernière fois ?',
    'Quels clients n\'ont pas été contactés ce mois ?',
    'Résume les notes de la semaine',
  ]

  // Desktop tabs — underline style
  const desktopTabs = (
    <div className="flex gap-6" style={{ borderBottom: '1px solid rgba(30,39,97,0.10)' }}>
      {([
        { value: 'portfolio' as const, label: 'Mon portefeuille', icon: Briefcase },
        { value: 'global' as const, label: 'Portefeuille global', icon: Globe },
      ]).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setActiveTab(value)}
          className="flex items-center gap-1.5 pb-2.5 text-sm transition-all duration-200 border-b-2 -mb-px"
          style={activeTab === value
            ? { borderBottomColor: '#4C6EF5', color: '#1E2761', fontWeight: 500 }
            : { borderBottomColor: 'transparent', color: '#94A3B8', fontWeight: 400 }}
        >
          <Icon className="w-3.5 h-3.5" />{label}
        </button>
      ))}
    </div>
  )

  const conversationMessages = (
    <>
      {inConversation && (
        <div className="flex justify-center mb-1">
          <button onClick={handleReset}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#1E2761] transition-colors">
            <RotateCcw className="w-3 h-3" />Nouvelle recherche
          </button>
        </div>
      )}
      {conversation.map((msg, i) => {
        if (msg.role === 'user') return (
          <div key={i} className="flex justify-end">
            <div className="max-w-[85%] px-4 py-2.5 leading-relaxed"
              style={{ background: '#4C6EF5', borderRadius: '12px 12px 4px 12px', fontSize: 13, color: 'white' }}>
              {msg.content}
            </div>
          </div>
        )
        return (
          <div key={i} className="flex flex-col gap-1 items-start">
            <div className="px-4 py-3"
              style={{ background: '#F5F7FF', borderRadius: '12px 12px 12px 4px', fontSize: 13, color: '#2D3A5A', maxWidth: 680, lineHeight: 1.6 }}>
              {parseAIContent(msg.content)}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <p className="text-[10px] text-[#8899BB] px-1">
                Sources : {msg.sources.map((s) => s.title ?? (s.type === 'note' ? `note du ${fmt(s.date)}` : s.file_name ?? 'doc')).join(' · ')}
              </p>
            )}
          </div>
        )
      })}
      {loading && (
        <div className="flex flex-col gap-1 items-start">
          <div className="px-4 py-3 space-y-2"
            style={{ background: '#F5F7FF', borderRadius: '12px 12px 12px 4px', minWidth: 120 }}>
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
      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col" style={{ height: '100dvh' }}>
        <div className="flex items-center gap-3 px-4 pl-16 py-3 bg-white shrink-0"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}>
          <span className="flex-1 text-[16px] font-bold text-[#0A1628]">Recherche IA</span>
          <button onClick={() => router.push('/app/import')}
            className="flex items-center justify-center"
            style={{ background: '#F0F4FF', borderRadius: 8, width: 28, height: 28 }}>
            <Upload className="text-[#4C6EF5]" style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Mobile tabs — lightweight */}
        <div className="flex shrink-0 items-center px-4 py-2 bg-white gap-6"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
          {(['portfolio', 'global'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="text-[13px] pb-1.5 transition-all border-b-2"
              style={activeTab === tab
                ? { borderBottomColor: '#4C6EF5', color: '#1E2761', fontWeight: 500 }
                : { borderBottomColor: 'transparent', color: '#94A3B8', fontWeight: 400 }}>
              {tab === 'portfolio' ? 'Mon portefeuille' : 'Portefeuille global'}
            </button>
          ))}
        </div>

        {inConversation ? (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 px-[14px] py-4 space-y-3">
              {conversationMessages}
            </div>
            <div className="shrink-0 bg-white px-[12px] pt-3"
              style={{ borderTop: '1px solid #E5EAF5', paddingBottom: 'max(80px, calc(env(safe-area-inset-bottom, 0px) + 20px))' }}>
              {inputBarSmall(mobileInputRef)}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 w-full">
            <div className="text-center">
              <Sparkles className="mx-auto mb-3" style={{ width: 32, height: 32, color: '#4C6EF5' }} />
              <p style={{ fontSize: 20, fontWeight: 500, color: '#0A1628' }}>Que voulez-vous savoir ?</p>
              <p style={{ fontSize: 13, color: '#8899BB', marginTop: 8, maxWidth: 320, lineHeight: 1.5 }}>
                Posez une question sur n'importe quel client, note ou document de votre équipe.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => { setInput(s); setTimeout(() => doSearch(s), 0) }}
                  className="transition-opacity hover:opacity-80"
                  style={{
                    background: '#F0F4FF', border: '0.5px solid #C5D0F0',
                    borderRadius: 20, padding: '8px 16px', fontSize: 13, color: '#64748B',
                  }}>
                  {s}
                </button>
              ))}
            </div>
            <div className="w-full">
              {inputBarLarge(mobileInputRef)}
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">

        {/* Top bar — always visible */}
        <div className="shrink-0 px-8 pt-6 pb-4 bg-[#F0F4FF]" style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
          <Breadcrumb items={[
            { label: 'MAIMOO', href: '/app/dashboard' },
            { label: 'Recherche IA' },
          ]} />
          <div className="flex items-center justify-between mt-3 mb-4">
            <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight">Recherche IA</h1>
            {inConversation && (
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#1E2761] transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />Nouvelle recherche
              </button>
            )}
          </div>

          {desktopTabs}

          {activeTab === 'portfolio' && (
            <div className="relative mt-3">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[#0F172A] focus:outline-none"
                style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(30,39,97,0.12)' }}>
                <option value="">Toutes mes entreprises</option>
                {portfolioAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {(['all', 'client', 'prospect'] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150"
                style={statusFilter === f
                  ? { background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)', color: 'white' }
                  : { background: 'white', color: '#64748B', border: '1px solid rgba(30,39,97,0.12)' }}>
                {f === 'all' ? 'Tous' : f === 'client' ? 'Clients' : 'Prospects'}
              </button>
            ))}
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville..."
              className="px-3 py-1.5 rounded-xl text-xs text-slate-600 placeholder-slate-400 focus:outline-none w-24"
              style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(30,39,97,0.12)' }} />
          </div>
        </div>

        {/* Content area */}
        {inConversation ? (
          <>
            <div className="flex-1 overflow-y-auto px-8 py-4">
              <div className="max-w-2xl mx-auto space-y-3">
                {conversationMessages}
              </div>
            </div>
            <div className="shrink-0 px-8 py-4 bg-white" style={{ borderTop: '1px solid #E5EAF5' }}>
              <div className="max-w-2xl mx-auto">
                {inputBarSmall(desktopInputRef)}
              </div>
            </div>
          </>
        ) : (
          /* Empty state — centered */
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-8">
            <div className="text-center">
              <Sparkles style={{ width: 32, height: 32, color: '#4C6EF5', margin: '0 auto' }} />
              <h2 style={{ fontSize: 24, fontWeight: 500, color: '#0F172A', marginTop: 12 }}>
                Que voulez-vous savoir ?
              </h2>
              <p style={{ fontSize: 14, color: '#64748B', marginTop: 8, maxWidth: 400, lineHeight: 1.6 }}>
                Posez une question sur n'importe quel client, note ou document de votre équipe.
              </p>
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setTimeout(() => doSearch(s), 0) }}
                  className="transition-opacity hover:opacity-80"
                  style={{
                    background: '#F0F4FF', border: '0.5px solid #C5D0F0',
                    borderRadius: 20, padding: '8px 16px', fontSize: 13, color: '#64748B',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Large input bar */}
            <div style={{ width: '100%', maxWidth: 680 }}>
              {inputBarLarge(desktopInputRef)}
            </div>
          </div>
        )}
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

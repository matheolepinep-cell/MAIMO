'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Briefcase, Globe, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { SearchBar } from '@/components/ui/SearchBar'
import { AnswerCard } from '@/components/ui/AnswerCard'
import type { SearchSource } from '@/types/database'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

type SearchTab = 'portfolio' | 'global'
type StatusFilter = 'all' | 'client' | 'prospect'

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

const SUGGESTIONS = [
  'Délai de livraison ?',
  'Dernier contact ?',
  'Conditions de remise ?',
  'Qui appeler ?',
]

function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()

  const [activeTab, setActiveTab] = useState<SearchTab>('portfolio')
  const [portfolioAccounts, setPortfolioAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [globalAccountIds, setGlobalAccountIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [city, setCity] = useState('')

  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<SearchSource[]>([])
  const [loading, setLoading] = useState(false)

  // Read initial query from URL
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setQuery(q)
  }, [searchParams])

  // Load data
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

  // Auto-search when query comes from URL
  const didAutoSearch = useRef(false)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !didAutoSearch.current && !profileLoading && profile && portfolioAccounts.length > 0) {
      didAutoSearch.current = true
      doSearch(q)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, profileLoading, profile, portfolioAccounts])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !profile) return
    setLoading(true); setAnswer(''); setSources([])
    try {
      const body: Record<string, unknown> = {
        query: q,
        company_id: profile.company_id,
        status: statusFilter,
        city: city.trim() || undefined,
      }
      if (activeTab === 'portfolio') {
        body[selectedAccountId ? 'account_id' : 'account_ids'] = selectedAccountId || portfolioAccounts.map((a) => a.id)
      } else {
        body.account_ids = globalAccountIds
      }
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      setAnswer(data.answer ?? ''); setSources(data.sources ?? [])
    } catch {
      setAnswer('Une erreur est survenue. Veuillez réessayer.')
    }
    setLoading(false)
  }, [profile, activeTab, selectedAccountId, portfolioAccounts, globalAccountIds, statusFilter, city])

  const handleSubmit = (q: string) => {
    setQuery(q)
    doSearch(q)
  }

  const speakAnswer = () => {
    if (!answer || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(answer), { lang: 'fr-FR' }))
  }

  const handleSourceClick = (src: SearchSource) => {
    if (src.type === 'document' && src.url) window.open(src.url, '_blank')
    else router.push(`/app/accounts/${src.id}`)
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Recherche IA" />

      <div className="flex-1 p-4 md:p-8 max-w-2xl mx-auto w-full space-y-4">
        <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight hidden md:block">Recherche IA</h1>

        {/* Search bar always at top */}
        <SearchBar
          onSubmit={handleSubmit}
          defaultValue={query}
          large
          autoFocus
          staticPlaceholder="Posez votre question…"
        />

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {([
            { value: 'portfolio' as const, label: 'Mon portefeuille', icon: Briefcase },
            { value: 'global' as const, label: 'Portefeuille global', icon: Globe },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setActiveTab(value); setAnswer(''); setSources([]) }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
                activeTab === value
                  ? 'border-[#1E2761] text-[#1E2761]'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Portfolio account selector */}
        {activeTab === 'portfolio' && (
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-200 transition-all duration-200"
            >
              <option value="">Toutes mes entreprises</option>
              {portfolioAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'client', 'prospect'] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                statusFilter === f ? 'bg-[#1E2761] text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'client' ? 'Clients' : 'Prospects'}
            </button>
          ))}
          <input
            type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville..."
            className="px-3 py-1.5 rounded-xl text-xs border border-slate-200 bg-white text-slate-600 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-200 transition-all duration-200 w-24"
          />
        </div>

        {/* Suggestions (shown when no answer) */}
        {!answer && !loading && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2.5 uppercase tracking-wide">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:border-[#1E2761] hover:text-[#1E2761] transition-all duration-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <AnswerCard answer="" sources={[]} isLoading />
        )}

        {/* Answer */}
        {!loading && answer && (
          <AnswerCard
            answer={answer}
            sources={sources}
            onSpeak={speakAnswer}
            onClear={() => { setAnswer(''); setSources([]) }}
            onSourceClick={handleSourceClick}
          />
        )}
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  )
}

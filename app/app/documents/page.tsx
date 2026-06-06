'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, ChevronLeft, ChevronRight, X, ExternalLink, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

type DocRow = {
  id: string
  title: string | null
  file_name: string
  file_url: string
  file_type: 'pdf' | 'docx' | 'xlsx' | 'image'
  created_at: string
  account_id: string | null
  account_name: string
  author_name: string
}

const PAGE_SIZE = 20

function fmt(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

function docIcon(type: string) {
  const base = 'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white'
  const styles: Record<string, { bg: string; label: string }> = {
    pdf: { bg: '#EF4444', label: 'PDF' },
    docx: { bg: '#3B82F6', label: 'DOC' },
    xlsx: { bg: '#10B981', label: 'XLS' },
    image: { bg: '#8B5CF6', label: 'IMG' },
  }
  const s = styles[type] ?? { bg: '#94A3B8', label: '?' }
  return { className: base, bg: s.bg, label: s.label }
}

export default function DocumentsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { wsId, currentWorkspace } = useWorkspace()

  const [docs, setDocs] = useState<DocRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [portfolio, setPortfolio] = useState<'all' | 'perso' | 'global'>('all')
  const [clientFilter, setClientFilter] = useState<{ id: string; name: string } | null>(null)
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; name: string }[]>([])
  const [showClientDrop, setShowClientDrop] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'pdf' | 'docx' | 'xlsx' | 'image'>('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc' | 'az'>('desc')
  const [nameSearch, setNameSearch] = useState('')

  // Portfolio accounts
  const [portfolioAccountIds, setPortfolioAccountIds] = useState<string[]>([])

  useEffect(() => {
    if (!profile) return
    const supabase = createClient()
    supabase.from('portfolio').select('account_id').eq('user_id', profile.id).then(({ data }) => {
      setPortfolioAccountIds((data ?? []).map((r: { account_id: string }) => r.account_id))
    })
  }, [profile])

  const fetchDocs = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const supabase = createClient()
    const cid = profile.company_id

    let q = supabase
      .from('documents')
      .select('id, title, file_name, file_url, file_type, created_at, account_id, user_id', { count: 'exact' })
      .eq('company_id', cid)
      .eq('is_deleted', false)

    if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    if (clientFilter) q = q.eq('account_id', clientFilter.id)
    if (typeFilter !== 'all') q = q.eq('file_type', typeFilter)
    if (nameSearch.trim()) q = q.ilike('file_name', `%${nameSearch.trim()}%`)
    if (portfolio === 'perso' && portfolioAccountIds.length > 0) q = q.in('account_id', portfolioAccountIds)
    if (portfolio === 'perso' && portfolioAccountIds.length === 0) { setDocs([]); setTotal(0); setLoading(false); return }

    if (sortOrder === 'desc') q = q.order('created_at', { ascending: false })
    else if (sortOrder === 'asc') q = q.order('created_at', { ascending: true })
    else q = q.order('file_name', { ascending: true })

    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const { data: docsData, count } = await q
    setTotal(count ?? 0)

    if (!docsData || docsData.length === 0) { setDocs([]); setLoading(false); return }

    const accountIds = [...new Set(docsData.map((d: { account_id: string | null }) => d.account_id).filter(Boolean))]
    const userIds = [...new Set(docsData.map((d: { user_id: string }) => d.user_id).filter(Boolean))]

    const [{ data: accs }, { data: usrs }] = await Promise.all([
      accountIds.length > 0 ? supabase.from('accounts').select('id, name').in('id', accountIds) : Promise.resolve({ data: [] }),
      userIds.length > 0 ? supabase.from('users').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
    ])

    const accMap = Object.fromEntries(((accs ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
    const userMap = Object.fromEntries(((usrs ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]))

    setDocs(docsData.map((d: { id: string; title: string | null; file_name: string; file_url: string; file_type: 'pdf' | 'docx' | 'xlsx' | 'image'; created_at: string; account_id: string | null; user_id: string }) => ({
      id: d.id,
      title: d.title,
      file_name: d.file_name,
      file_url: d.file_url,
      file_type: d.file_type,
      created_at: d.created_at,
      account_id: d.account_id,
      account_name: d.account_id ? (accMap[d.account_id] ?? 'Non associé') : 'Non associé',
      author_name: userMap[d.user_id] ?? 'Quelqu\'un',
    })))
    setLoading(false)
  }, [profile, wsId, clientFilter, typeFilter, nameSearch, portfolio, portfolioAccountIds, sortOrder, page])

  useEffect(() => {
    if (!profileLoading && profile) fetchDocs()
  }, [profileLoading, profile, fetchDocs])

  useEffect(() => {
    if (!clientQuery.trim() || !profile?.company_id) { setClientResults([]); return }
    const t = setTimeout(async () => {
      const supabase = createClient()
      let q = supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).ilike('name', `%${clientQuery}%`).order('name').limit(7)
      if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      const { data } = await q
      setClientResults(data ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [clientQuery, profile, wsId])

  const hasFilters = portfolio !== 'all' || clientFilter !== null || typeFilter !== 'all' || sortOrder !== 'desc' || nameSearch.trim() !== ''
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col min-h-full bg-[#F0F4FF]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => router.push('/app/dashboard')} className="p-2 rounded-xl text-[#64748B] hover:bg-gray-100 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-[#1E293B]">
            Documents {!loading && <span className="text-[#94A3B8] font-normal text-sm">({total})</span>}
          </h1>
          {currentWorkspace && <p className="text-xs text-[#94A3B8]">{currentWorkspace.name}</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex flex-wrap items-center gap-2">
        <select value={portfolio} onChange={(e) => { setPortfolio(e.target.value as 'all' | 'perso' | 'global'); setPage(0) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]">
          <option value="all">Tous les portefeuilles</option>
          <option value="perso">Mon portefeuille</option>
          <option value="global">Global</option>
        </select>

        {/* Client filter */}
        <div className="relative">
          {clientFilter ? (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-[#EEF2FF] rounded-lg text-xs font-medium text-[#1E2761]">
              {clientFilter.name}
              <button onClick={() => { setClientFilter(null); setClientQuery(''); setPage(0) }}><X className="w-3 h-3 ml-1 hover:text-red-500" /></button>
            </div>
          ) : (
            <>
              <input type="text" placeholder="Filtrer par client..." value={clientQuery}
                onChange={(e) => { setClientQuery(e.target.value); setShowClientDrop(true) }}
                onFocus={() => setShowClientDrop(true)}
                onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-[#1E293B] w-36 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
              {showClientDrop && clientResults.length > 0 && (
                <div className="absolute z-40 mt-1 left-0 w-52 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden">
                  {clientResults.map((acc) => (
                    <button key={acc.id} onMouseDown={() => { setClientFilter(acc); setClientQuery(''); setShowClientDrop(false); setPage(0) }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[#F0F4FF] transition-colors">{acc.name}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as 'all' | 'pdf' | 'docx' | 'xlsx' | 'image'); setPage(0) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]">
          <option value="all">Tous les types</option>
          <option value="pdf">PDF</option>
          <option value="docx">Word</option>
          <option value="xlsx">Excel</option>
          <option value="image">Image</option>
        </select>

        <select value={sortOrder} onChange={(e) => { setSortOrder(e.target.value as 'desc' | 'asc' | 'az'); setPage(0) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]">
          <option value="desc">Date (récent)</option>
          <option value="asc">Date (ancien)</option>
          <option value="az">A → Z</option>
        </select>

        <input type="text" placeholder="Rechercher par nom..." value={nameSearch}
          onChange={(e) => { setNameSearch(e.target.value); setPage(0) }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-[#1E293B] w-40 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
        />

        {hasFilters && (
          <button onClick={() => { setPortfolio('all'); setClientFilter(null); setClientQuery(''); setTypeFilter('all'); setSortOrder('desc'); setNameSearch(''); setPage(0) }}
            className="text-xs text-[#64748B] hover:text-[#1E2761] underline transition-colors">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Documents list */}
      <div className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
            <FileText className="w-10 h-10 mb-2 text-gray-200" />
            <p className="text-sm">Aucun document trouvé</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {docs.map((doc) => {
              const icon = docIcon(doc.file_type)
              return (
                <div key={doc.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ border: '1px solid rgba(30,39,97,0.07)' }}>
                  <div className={icon.className} style={{ background: icon.bg }}>
                    {icon.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => window.open(doc.file_url, '_blank')}
                      className="text-sm font-medium text-[#0F172A] hover:text-[#4C6EF5] truncate block text-left transition-colors"
                    >
                      {doc.file_name}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5">
                      {doc.account_id ? (
                        <button onClick={() => router.push(`/app/accounts/${doc.account_id}`)}
                          className="text-[11px] text-[#8899BB] hover:underline">
                          {doc.account_name}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#94A3B8]">Non associé</span>
                      )}
                      <span className="text-[11px] text-[#94A3B8]">· {fmt(doc.created_at)} · {doc.author_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => window.open(doc.file_url, '_blank')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-gray-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Voir
                    </button>
                    {doc.account_id && (
                      <button
                        onClick={() => router.push(`/app/accounts/${doc.account_id}`)}
                        className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#1E2761] hover:bg-gray-100 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="p-2 rounded-lg text-[#64748B] hover:bg-white disabled:opacity-30 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-[#64748B]">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-2 rounded-lg text-[#64748B] hover:bg-white disabled:opacity-30 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

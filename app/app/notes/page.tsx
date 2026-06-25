'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mic, Paperclip, ChevronLeft, ChevronRight, X, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

type NoteRow = {
  id: string
  title: string | null
  content: string
  source: 'vocal' | 'text'
  created_at: string
  account_id: string | null
  account_name: string
  author_name: string
  has_attachments: boolean
}

const PAGE_SIZE = 20

function fmt(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

export default function NotesPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { wsId, currentWorkspace } = useWorkspace()

  const [notes, setNotes] = useState<NoteRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [portfolio, setPortfolio] = useState<'all' | 'perso' | 'global'>('all')
  const [clientFilter, setClientFilter] = useState<{ id: string; name: string } | null>(null)
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; name: string }[]>([])
  const [showClientDrop, setShowClientDrop] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc' | 'az'>('desc')

  // Drawer
  const [drawerNote, setDrawerNote] = useState<NoteRow | null>(null)

  // Portfolio accounts for perso filter
  const [portfolioAccountIds, setPortfolioAccountIds] = useState<string[]>([])

  useEffect(() => {
    if (!profile) return
    const supabase = createClient()
    supabase.from('portfolio').select('account_id').eq('user_id', profile.id).then(({ data }) => {
      setPortfolioAccountIds((data ?? []).map((r: { account_id: string }) => r.account_id))
    })
  }, [profile])

  const fetchNotes = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const supabase = createClient()
    const cid = profile.company_id

    let q = supabase
      .from('notes')
      .select('id, title, content, source, created_at, account_id, user_id', { count: 'exact' })
      .eq('company_id', cid)
      .eq('is_deleted', false)

    if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    if (clientFilter) q = q.eq('account_id', clientFilter.id)
    if (portfolio === 'perso' && portfolioAccountIds.length > 0) q = q.in('account_id', portfolioAccountIds)
    if (portfolio === 'perso' && portfolioAccountIds.length === 0) { setNotes([]); setTotal(0); setLoading(false); return }

    if (sortOrder === 'desc') q = q.order('created_at', { ascending: false })
    else if (sortOrder === 'asc') q = q.order('created_at', { ascending: true })
    else q = q.order('title', { ascending: true })

    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const { data: notesData, count } = await q
    setTotal(count ?? 0)

    if (!notesData || notesData.length === 0) { setNotes([]); setLoading(false); return }

    const accountIds = [...new Set(notesData.map((n: { account_id: string }) => n.account_id).filter(Boolean))]
    const userIds = [...new Set(notesData.map((n: { user_id: string }) => n.user_id).filter(Boolean))]

    const [{ data: accs }, { data: usrs }] = await Promise.all([
      accountIds.length > 0 ? supabase.from('accounts').select('id, name').in('id', accountIds) : Promise.resolve({ data: [] }),
      userIds.length > 0 ? supabase.from('users').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
    ])

    const accMap = Object.fromEntries(((accs ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
    const userMap = Object.fromEntries(((usrs ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]))

    setNotes(notesData.map((n: { id: string; title: string | null; content: string; source: 'vocal' | 'text'; created_at: string; account_id: string | null; user_id: string }) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      source: n.source,
      created_at: n.created_at,
      account_id: n.account_id,
      account_name: n.account_id ? (accMap[n.account_id] ?? '—') : '—',
      author_name: userMap[n.user_id] ?? 'Quelqu\'un',
      has_attachments: false,
    })))
    setLoading(false)
  }, [profile, wsId, clientFilter, portfolio, portfolioAccountIds, sortOrder, page])

  useEffect(() => {
    if (!profileLoading && profile) fetchNotes()
  }, [profileLoading, profile, fetchNotes])

  // Client search dropdown
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

  const hasFilters = portfolio !== 'all' || clientFilter !== null || sortOrder !== 'desc'
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col min-h-full bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => router.push('/app/dashboard')} className="p-2 rounded-xl text-[#64748B] hover:bg-gray-100 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-[#1E293B]">
            Notes {!loading && <span className="text-[#94A3B8] font-normal text-sm">({total})</span>}
          </h1>
          {currentWorkspace && <p className="text-xs text-[#94A3B8]">{currentWorkspace.name}</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex flex-wrap items-center gap-2">
        {/* Portfolio filter */}
        <select
          value={portfolio}
          onChange={(e) => { setPortfolio(e.target.value as 'all' | 'perso' | 'global'); setPage(0) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
        >
          <option value="all">Tous les portefeuilles</option>
          <option value="perso">Mon portefeuille</option>
          <option value="global">Global</option>
        </select>

        {/* Client filter */}
        <div className="relative">
          {clientFilter ? (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-[#F5F5F5] rounded-lg text-xs font-medium text-[#0A0A0A]">
              {clientFilter.name}
              <button onClick={() => { setClientFilter(null); setClientQuery(''); setPage(0) }} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Filtrer par client..."
                value={clientQuery}
                onChange={(e) => { setClientQuery(e.target.value); setShowClientDrop(true) }}
                onFocus={() => setShowClientDrop(true)}
                onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-[#1E293B] w-40 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
              {showClientDrop && clientResults.length > 0 && (
                <div className="absolute z-40 mt-1 left-0 w-52 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden">
                  {clientResults.map((acc) => (
                    <button key={acc.id} onMouseDown={() => { setClientFilter(acc); setClientQuery(''); setShowClientDrop(false); setPage(0) }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[#F5F5F5] transition-colors">{acc.name}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sort */}
        <select
          value={sortOrder}
          onChange={(e) => { setSortOrder(e.target.value as 'desc' | 'asc' | 'az'); setPage(0) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
        >
          <option value="desc">Date (récent)</option>
          <option value="asc">Date (ancien)</option>
          <option value="az">A → Z</option>
        </select>

        {/* Reset */}
        {hasFilters && (
          <button onClick={() => { setPortfolio('all'); setClientFilter(null); setClientQuery(''); setSortOrder('desc'); setPage(0) }}
            className="text-xs text-[#64748B] hover:text-[#0A0A0A] underline transition-colors">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Notes list */}
      <div className="flex-1 p-4 pb-24 md:pb-4 max-w-4xl mx-auto w-full">
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
            <p className="text-sm">Aucune note trouvée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => setDrawerNote(note)}
                className="w-full bg-white rounded-xl p-4 text-left hover:shadow-md transition-all duration-150"
                style={{ border: '1px solid rgba(30,39,97,0.07)' }}
              >
                {note.account_id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/app/accounts/${note.account_id}`) }}
                    className="text-[11px] text-[#6B6B6B] hover:underline mb-1 block"
                  >
                    {note.account_name}
                  </button>
                )}
                <p className="text-sm font-semibold text-[#0F172A] truncate">
                  {note.title ?? `Note du ${fmt(note.created_at)}`}
                </p>
                <p className="text-xs text-[#64748B] mt-1 line-clamp-3">{note.content}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5">
                    {note.source === 'vocal' && <Mic className="w-3 h-3 text-red-400" />}
                    {note.has_attachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                  </div>
                  <span className="text-[10px] text-[#94A3B8]">{fmt(note.created_at)} · {note.author_name}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg text-[#64748B] hover:bg-white disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-[#64748B]">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg text-[#64748B] hover:bg-white disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Note drawer */}
      {drawerNote && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawerNote(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {drawerNote.account_id && (
                  <button
                    onClick={() => router.push(`/app/accounts/${drawerNote.account_id}`)}
                    className="text-[11px] text-[#6B6B6B] hover:underline mb-1 block"
                  >
                    {drawerNote.account_name}
                  </button>
                )}
                <h2 className="font-bold text-[#0F172A] text-base">
                  {drawerNote.title ?? `Note du ${fmt(drawerNote.created_at)}`}
                </h2>
              </div>
              <button onClick={() => setDrawerNote(null)} className="p-1 text-[#94A3B8] hover:text-[#1E293B] ml-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
              {drawerNote.source === 'vocal' && <Mic className="w-3 h-3 text-red-400" />}
              <span>{fmt(drawerNote.created_at)} · {drawerNote.author_name}</span>
            </div>

            <div className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">
              {drawerNote.content}
            </div>

            {drawerNote.account_id && (
              <button
                onClick={() => router.push(`/app/accounts/${drawerNote.account_id}`)}
                className="flex items-center gap-1.5 text-xs font-medium text-[#0A0A0A] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Aller à la fiche client →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

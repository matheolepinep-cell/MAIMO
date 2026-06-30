'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, FileText, Mic, Type, ChevronRight, Upload, Users, Plus, Search, X, Sparkles, CloudUpload, Pencil, CalendarDays } from 'lucide-react'
const CalendarWidget = dynamic(() => import('@/components/calendar/CalendarWidget').then(m => m.CalendarWidget), { ssr: false })
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { getInitials } from '@/components/ui/CompanyCard'
import { CompanyProfileBanner } from '@/components/ui/CompanyProfileBanner'

/* ─── types ─── */
type MobileItem =
  | { kind: 'note'; id: string; title: string | null; content: string; account_id: string; account_name: string; source: 'vocal' | 'text'; created_at: string }
  | { kind: 'doc'; id: string; title: string | null; file_name: string; file_type: string; account_id: string; account_name: string; created_at: string }

type ActivityItem = {
  id: string; type: 'note' | 'document'
  author_name: string; account_name: string; account_id: string
  label: string; source?: 'vocal' | 'text'; file_type?: string; created_at: string
}

type PortfolioRow = { id: string; account_id: string; account_name: string; status: 'client' | 'prospect' }
type TeamRow = { id: string; full_name: string; role: 'admin' | 'commercial'; portfolio_count: number }
type Stats = { accounts: number; notes: number; docs: number; team: number; notesWeek: number; accountsWeek: number }

/* ─── helpers ─── */
function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)}min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)}h`
  if (s < 172800) return 'hier'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d))
}
function greeting() {
  const h = new Date().getHours()
  return h < 18 ? 'Bonjour' : 'Bonsoir'
}
function formatTime() {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
}
function formatDate() {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

/* ─── Skeleton ─── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-[#EFEFEF] animate-pulse rounded-xl ${className ?? ''}`} />
}


export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor } = useAccentColor()
  const { wsId } = useWorkspace()

  /* redirect mobile to search, unless navigated explicitly from menu */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && searchParams.get('from') !== 'menu') {
      router.replace('/app/search')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* mobile state */
  const [recentAccounts, setRecentAccounts] = useState<{ id: string; name: string }[]>([])
  const [mobileItems, setMobileItems] = useState<MobileItem[]>([])
  const [time, setTime] = useState('')
  const [greetingStr, setGreetingStr] = useState('')
  const [dateStr, setDateStr] = useState('')

  /* client search */
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; name: string; city: string | null; status: string }[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [showClientDrop, setShowClientDrop] = useState(false)
  const clientSearchRef = useRef<HTMLDivElement>(null)


  /* desktop state */
  const [stats, setStats] = useState<Stats>({ accounts: 0, notes: 0, docs: 0, team: 0, notesWeek: 0, accountsWeek: 0 })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [desktopLoading, setDesktopLoading] = useState(true)

  /* calendar state */
  const [calConnected, setCalConnected] = useState(false)
  const [calLoading, setCalLoading] = useState(true)

  useEffect(() => {
    setTime(formatTime())
    setGreetingStr(greeting())
    setDateStr(capitalize(formatDate()))
    const id = setInterval(() => {
      setTime(formatTime())
      setGreetingStr(greeting())
      setDateStr(capitalize(formatDate()))
    }, 60000)
    return () => clearInterval(id)
  }, [])


  useEffect(() => {
    try {
      setRecentAccounts(JSON.parse(localStorage.getItem('maimo_recent_accounts') ?? '[]').slice(0, 3))
    } catch { /* empty */ }
  }, [])

  useEffect(() => {
    if (profileLoading || !profile) return
    const supabase = createClient()
    const cid = profile.company_id
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const wf = wsId ? `workspace_id.eq.${wsId},workspace_id.is.null` : null

    const accCountQ = supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('company_id', cid)
    const noteCountQ = supabase.from('notes').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_deleted', false)
    const docCountQ = supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_deleted', false)
    const noteWkQ = supabase.from('notes').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_deleted', false).gte('created_at', weekAgo)
    const accWkQ = supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('company_id', cid).gte('created_at', weekAgo)
    const noteListQ = supabase.from('notes').select('id, title, content, account_id, source, created_at, user_id').eq('company_id', cid).eq('is_deleted', false).order('created_at', { ascending: false }).limit(8)
    const docListQ = supabase.from('documents').select('id, title, file_name, file_type, account_id, created_at, user_id').eq('company_id', cid).eq('is_deleted', false).order('created_at', { ascending: false }).limit(4)
    const pfQ = supabase.from('portfolio').select('id, account_id, accounts(id, name, status)').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(4)

    Promise.all([
      wf ? accCountQ.or(wf) : accCountQ,
      wf ? noteCountQ.or(wf) : noteCountQ,
      wf ? docCountQ.or(wf) : docCountQ,
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('company_id', cid),
      wf ? noteWkQ.or(wf) : noteWkQ,
      wf ? accWkQ.or(wf) : accWkQ,
      wf ? noteListQ.or(wf) : noteListQ,
      wf ? docListQ.or(wf) : docListQ,
      wf ? pfQ.or(wf) : pfQ,
      supabase.from('users').select('id, full_name, role').eq('company_id', cid).eq('is_active', true),
      supabase.from('portfolio').select('user_id').eq('company_id', cid),
    ]).then(async ([
      { count: accCount }, { count: noteCount }, { count: docCount }, { count: teamCount },
      { count: notesWeek }, { count: accountsWeek },
      { data: notes }, { data: docs },
      { data: pfRows },
      { data: users }, { data: allPf },
    ]) => {
      setStats({
        accounts: accCount ?? 0, notes: noteCount ?? 0,
        docs: docCount ?? 0, team: teamCount ?? 0,
        notesWeek: notesWeek ?? 0, accountsWeek: accountsWeek ?? 0,
      })

      const allAccountIds = [...new Set([...(notes ?? []).map((n) => n.account_id), ...(docs ?? []).map((d) => d.account_id)])]
      const allUserIds = [...new Set([...(notes ?? []).map((n) => n.user_id), ...(docs ?? []).map((d) => d.user_id)].filter(Boolean))]
      const [{ data: accs }, { data: usrs }] = await Promise.all([
        allAccountIds.length > 0 ? supabase.from('accounts').select('id, name').in('id', allAccountIds) : { data: [] },
        allUserIds.length > 0 ? supabase.from('users').select('id, full_name').in('id', allUserIds) : { data: [] },
      ])
      const accMap = Object.fromEntries((accs ?? []).map((a) => [a.id, a.name]))
      const userMap = Object.fromEntries((usrs ?? []).map((u) => [u.id, u.full_name]))

      const rawActivity: ActivityItem[] = [
        ...(notes ?? []).map((n) => ({
          id: n.id, type: 'note' as const,
          author_name: userMap[n.user_id] ?? 'Quelqu\'un',
          account_name: accMap[n.account_id] ?? '—',
          account_id: n.account_id,
          label: n.title ?? n.content?.slice(0, 40) ?? 'Note',
          source: n.source, created_at: n.created_at,
        })),
        ...(docs ?? []).map((d) => ({
          id: d.id, type: 'document' as const,
          author_name: userMap[d.user_id] ?? 'Quelqu\'un',
          account_name: accMap[d.account_id] ?? '—',
          account_id: d.account_id,
          label: d.title ?? d.file_name,
          file_type: d.file_type, created_at: d.created_at,
        })),
      ]
      rawActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setActivity(rawActivity.slice(0, 8))

      const mobileRaw: MobileItem[] = [
        ...(notes ?? []).slice(0, 5).map((n) => ({ kind: 'note' as const, id: n.id, title: n.title, content: n.content, account_id: n.account_id, account_name: accMap[n.account_id] ?? '—', source: n.source, created_at: n.created_at })),
        ...(docs ?? []).slice(0, 3).map((d) => ({ kind: 'doc' as const, id: d.id, title: d.title, file_name: d.file_name, file_type: d.file_type, account_id: d.account_id, account_name: accMap[d.account_id] ?? '—', created_at: d.created_at })),
      ]
      mobileRaw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setMobileItems(mobileRaw.slice(0, 5))

      type PfRow = { id: string; account_id: string; accounts: { id: string; name: string; status: 'client' | 'prospect' } | null }
      const pf = ((pfRows ?? []) as unknown as PfRow[]).map((r) => ({
        id: r.id, account_id: r.account_id,
        account_name: r.accounts?.name ?? '—',
        status: r.accounts?.status ?? 'prospect',
      }))
      setPortfolio(pf)

      const pfCounts: Record<string, number> = {}
      for (const row of allPf ?? []) {
        pfCounts[row.user_id] = (pfCounts[row.user_id] ?? 0) + 1
      }
      setTeam(
        ((users ?? []) as { id: string; full_name: string; role: 'admin' | 'commercial' }[])
          .map((u) => ({ id: u.id, full_name: u.full_name, role: u.role, portfolio_count: pfCounts[u.id] ?? 0 }))
          .sort((a, b) => b.portfolio_count - a.portfolio_count)
          .slice(0, 5)
      )

      setDesktopLoading(false)
    })
  }, [profileLoading, profile, wsId])

  useEffect(() => {
    if (!clientQuery.trim() || !profile?.company_id) { setClientResults([]); setClientLoading(false); return }
    setClientLoading(true)
    const timer = setTimeout(async () => {
      const supabase = createClient()
      let q = supabase
        .from('accounts')
        .select('id, name, city, status')
        .eq('company_id', profile.company_id)
        .ilike('name', `%${clientQuery.trim()}%`)
        .order('name')
        .limit(7)
      if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      const { data } = await q
      setClientResults(data ?? [])
      setClientLoading(false)
    }, 200)
    return () => clearTimeout(timer)
  }, [clientQuery, profile, wsId])

  useEffect(() => {
    if (profileLoading || !profile) return
    const supabase = createClient()
    supabase
      .from('users')
      .select('google_calendar_connected')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        setCalConnected(!!data?.google_calendar_connected)
        setCalLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, profile?.id])

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  const clientSearchBox = (
    <div className="relative" ref={clientSearchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#9B9B9B' }} />
        <input
          type="text"
          placeholder="Trouver une entreprise..."
          value={clientQuery}
          onChange={(e) => { setClientQuery(e.target.value); setShowClientDrop(true) }}
          onFocus={(e) => { setShowClientDrop(true); e.target.style.borderColor = '#2563EB'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)' }}
          onBlur={(e) => { e.target.style.borderColor = '#E5E5E5'; e.target.style.boxShadow = 'none'; setTimeout(() => setShowClientDrop(false), 150) }}
          className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm focus:outline-none transition-all duration-150"
          style={{
            border: '1px solid #E5E5E5',
            background: '#fff',
            color: '#0A0A0A',
          }}
        />
        {clientQuery && (
          <button onMouseDown={() => { setClientQuery(''); setClientResults([]) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: '#9B9B9B' }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showClientDrop && (clientQuery || recentAccounts.length > 0) && (
        <div className="absolute z-40 mt-1 w-full bg-white rounded-2xl overflow-hidden"
          style={{ border: '1px solid #E5E5E5', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
          {clientQuery ? (
            clientLoading ? (
              <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: '#9B9B9B' }}>
                <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#9B9B9B', borderTopColor: 'transparent' }} />
                Recherche…
              </div>
            ) : clientResults.length === 0 ? (
              <div className="px-4 py-3 text-sm" style={{ color: '#9B9B9B' }}>Aucune entreprise trouvée</div>
            ) : clientResults.map((acc) => (
              <button key={acc.id} onMouseDown={() => router.push(`/app/accounts/${acc.id}`)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F5F5F5' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: '#2563EB' }}>
                  {getInitials(acc.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#0A0A0A' }}>{acc.name}</p>
                  {acc.city && <p className="text-xs" style={{ color: '#9B9B9B' }}>{acc.city}</p>}
                </div>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={acc.status === 'client'
                    ? { background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }
                    : { background: '#F5F5F5', color: '#6B6B6B', border: '1px solid #E5E5E5' }}>
                  {acc.status === 'client' ? 'Client' : 'Prospect'}
                </span>
              </button>
            ))
          ) : (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B9B9B' }}>Récents</p>
              {recentAccounts.map((acc) => (
                <button key={acc.id} onMouseDown={() => router.push(`/app/accounts/${acc.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F5F5F5' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: '#2563EB' }}>
                    {getInitials(acc.name)}
                  </div>
                  <p className="text-sm font-medium truncate" style={{ color: '#0A0A0A' }}>{acc.name}</p>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )

  const statCards = [
    {
      label: 'Entreprises', value: stats.accounts,
      icon: Building2, iconColor: '#2563EB', iconBg: '#EFF6FF',
      delta: stats.accountsWeek > 0 ? `+${stats.accountsWeek} cette semaine` : null,
      href: '/app/accounts',
    },
    {
      label: 'Notes', value: stats.notes,
      icon: FileText, iconColor: '#2563EB', iconBg: '#EFF6FF',
      delta: stats.notesWeek > 0 ? `+${stats.notesWeek} cette semaine` : null,
      href: '/app/notes',
    },
    {
      label: 'Documents', value: stats.docs,
      icon: Upload, iconColor: '#2563EB', iconBg: '#EFF6FF',
      delta: null,
      href: '/app/documents',
    },
    {
      label: 'Membres', value: stats.team,
      icon: Users, iconColor: '#2563EB', iconBg: '#EFF6FF',
      delta: null,
      href: '/app/team',
    },
  ]

  return (
    <div className="flex flex-col min-h-full overflow-x-hidden">
      <div className="flex flex-col min-h-full">

        {/* Hero */}
        <div className="relative pl-16 pr-4 md:px-10 pt-5 md:pt-5 pb-8 md:pb-10 overflow-hidden"
          style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-xl md:text-3xl font-semibold tracking-tight" style={{ color: '#0A0A0A' }}>
                  {greetingStr}, {firstName}
                </h1>
                <p className="text-sm mt-1" style={{ color: '#9CA3AF' }}>{dateStr} · {time}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#2563EB' }}>
                <span className="text-white text-sm font-semibold">
                  {profile?.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-3 md:px-10 pt-11 pb-24 md:py-8 -mt-6" style={{ background: '#F5F5F5' }}>
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Actions rapides */}
            <div>
              <p className="text-[13px] font-semibold mb-2" style={{ color: '#6B6B6B' }}>Actions rapides</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <button
                  onClick={() => router.push('/app/search')}
                  className="col-span-2 md:col-span-1 text-left flex flex-col gap-2 transition-opacity hover:opacity-90 active:opacity-75"
                  style={{ background: '#2563EB', borderRadius: 12, padding: 14 }}
                >
                  <Sparkles className="w-5 h-5 text-white" />
                  <div>
                    <p className="text-[13px] font-medium text-white leading-snug">Recherche IA</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Posez une question sur vos clients</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push('/app/notes/new')}
                  className="text-left flex flex-col gap-2 transition-opacity hover:opacity-90 active:opacity-75"
                  style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E5E5E5' }}
                >
                  <Pencil className="w-5 h-5" style={{ color: '#0A0A0A' }} />
                  <div>
                    <p className="text-[13px] font-medium leading-snug" style={{ color: '#0A0A0A' }}>Nouvelle note</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#6B6B6B' }}>Texte ou vocal, client détecté auto</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push('/app/import')}
                  className="text-left flex flex-col gap-2 transition-opacity hover:opacity-90 active:opacity-75"
                  style={{ background: '#F5F5F5', borderRadius: 12, padding: 14, border: '1px solid #E5E5E5' }}
                >
                  <CloudUpload className="w-5 h-5" style={{ color: '#0A0A0A' }} />
                  <div>
                    <p className="text-[13px] font-medium leading-snug" style={{ color: '#0A0A0A' }}>Importer</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#6B6B6B' }}>PDF, Word, Excel, image — classé auto</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Company profile banner */}
            <CompanyProfileBanner />

            {/* Client search */}
            <div className="max-w-lg">
              {clientSearchBox}
            </div>

            {/* ROW 1 — Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
              {statCards.map(({ label, value, icon: Icon, iconColor, iconBg, delta, href }) => (
                <button
                  key={label}
                  onClick={() => router.push(href)}
                  className="text-left bg-white rounded-2xl p-3.5 md:p-5 transition-all duration-150 hover:-translate-y-0.5"
                  style={{
                    border: '1px solid #E5E5E5',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#2563EB'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E5E5E5'
                  }}
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center mb-2 md:mb-4"
                    style={{ background: iconBg }}>
                    <Icon className="w-4 h-4 md:w-5 md:h-5" style={{ color: iconColor }} />
                  </div>
                  {desktopLoading
                    ? <Skeleton className="h-7 w-14 mb-1 md:h-9 md:w-16" />
                    : <p className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: '#0A0A0A' }}>{value}</p>
                  }
                  <p className="text-xs md:text-sm mt-0.5" style={{ color: '#6B6B6B' }}>{label}</p>
                  {delta && !desktopLoading && (
                    <p className="text-xs font-medium mt-1.5" style={{ color: '#16A34A' }}>{delta}</p>
                  )}
                </button>
              ))}
            </div>

            {/* Agenda */}
            <div className="bg-white rounded-2xl overflow-hidden"
              style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #E5E5E5' }}>
                <CalendarDays className="w-4 h-4" style={{ color: '#0A0A0A' }} />
                <h2 className="font-semibold" style={{ color: '#0A0A0A' }}>Agenda</h2>
              </div>
              {calLoading ? (
                <div className="px-5 py-4 space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-24 h-4 shrink-0" />
                      <Skeleton className="flex-1 h-4" />
                    </div>
                  ))}
                </div>
              ) : !calConnected ? (
                <div className="px-5 py-8 flex flex-col items-center text-center">
                  <CalendarDays className="w-8 h-8 mb-3" style={{ color: '#E5E5E5' }} />
                  <p className="text-sm font-medium mb-1" style={{ color: '#0A0A0A' }}>Google Calendar non connecté</p>
                  <p className="text-xs mb-4" style={{ color: '#9B9B9B' }}>Synchronisez vos RDV pour les voir ici</p>
                  <a href="/api/auth/google"
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{ background: '#2563EB' }}>
                    Connecter Google Calendar
                  </a>
                </div>
              ) : profile ? (
                <CalendarWidget
                  userId={profile.id}
                  workspaceId={wsId}
                  companyId={profile.company_id}
                />
              ) : null}
            </div>

            {/* ROW 2 — Portfolio + Team */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-5">

              {/* Portfolio card */}
              <div className="bg-white rounded-2xl overflow-hidden"
                style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: '1px solid #E5E5E5' }}>
                  <h2 className="font-semibold" style={{ color: '#0A0A0A' }}>Mon portefeuille</h2>
                  <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/app/import')} className="flex items-center gap-1 text-xs font-medium transition-colors duration-150" style={{ color: '#9B9B9B' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#2563EB' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#9B9B9B' }}>
                      <Upload className="w-3 h-3" />Importer
                    </button>
                    <button onClick={() => router.push('/app/portfolio')} className="text-xs font-medium transition-colors" style={{ color: '#2563EB' }}>Voir tout →</button>
                  </div>
                </div>
                {desktopLoading ? (
                  <div className="divide-y" style={{ borderColor: '#E5E5E5' }}>
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                      </div>
                    ))}
                  </div>
                ) : portfolio.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm" style={{ color: '#9B9B9B' }}>Portefeuille vide</p>
                    <button onClick={() => router.push('/app/portfolio')} className="mt-2 text-xs font-medium" style={{ color: '#2563EB' }}>Ajouter des entreprises →</button>
                  </div>
                ) : (
                  <div>
                    {portfolio.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => router.push(`/app/accounts/${item.account_id}`)}
                        className="w-full flex items-center gap-3 px-5 py-3 transition-colors duration-150 text-left"
                        style={{ borderBottom: '1px solid #F5F5F5', background: 'transparent' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F5F5F5' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
                          style={{ background: '#2563EB' }}>
                          {getInitials(item.account_name)}
                        </div>
                        <span className="flex-1 text-sm font-medium truncate" style={{ color: '#0A0A0A' }}>{item.account_name}</span>
                        <span
                          className="shrink-0 w-2 h-2 rounded-full"
                          style={{ background: item.status === 'client' ? '#16A34A' : '#6B6B6B' }}
                        />
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: '#9B9B9B' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Team card */}
              <div className="bg-white rounded-2xl overflow-hidden"
                style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: '1px solid #E5E5E5' }}>
                  <h2 className="font-semibold" style={{ color: '#0A0A0A' }}>Équipe</h2>
                  <button onClick={() => router.push('/app/team')} className="text-xs font-medium" style={{ color: '#2563EB' }}>Voir tout →</button>
                </div>
                {desktopLoading ? (
                  <div>
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid #F5F5F5' }}>
                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {team.map((member) => {
                      const initials = member.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
                      return (
                        <div key={member.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid #F5F5F5' }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: '#EFEFEF' }}>
                            <span className="text-xs font-semibold" style={{ color: '#0A0A0A' }}>{initials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: '#0A0A0A' }}>{member.full_name}</p>
                            <p className="text-xs" style={{ color: '#9B9B9B' }}>
                              {member.portfolio_count} entreprise{member.portfolio_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                            style={member.role === 'admin' ? {
                              background: '#2563EB',
                              color: '#fff',
                              borderColor: '#2563EB',
                            } : {
                              background: '#F5F5F5',
                              color: '#6B6B6B',
                              borderColor: '#E5E5E5',
                            }}
                          >
                            {member.role === 'admin' ? 'Admin' : 'Collaborateur'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ROW 3 — Compact Activity */}
            {activity.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden"
                style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
                  <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Activité récente</h2>
                </div>
                <div>
                  {activity.slice(0, 3).map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={async () => {
                        if (item.type === 'document') {
                          const res = await fetch(`/api/documents/${item.id}/url`).catch(() => null)
                          if (res?.ok) {
                            const { url } = await res.json()
                            if (url) { window.open(url, '_blank'); return }
                          }
                        }
                        router.push(`/app/accounts/${item.account_id}`)
                      }}
                      className="w-full flex items-center gap-3 px-5 py-2.5 transition-colors duration-150 text-left"
                      style={{ borderBottom: '1px solid #F5F5F5', background: 'transparent' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F5F5F5' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: '#EFEFEF' }}>
                        {item.type === 'note'
                          ? (item.source === 'vocal' ? <Mic className="w-3 h-3" style={{ color: '#0A0A0A' }} /> : <Type className="w-3 h-3" style={{ color: '#0A0A0A' }} />)
                          : <Upload className="w-3 h-3" style={{ color: '#0A0A0A' }} />}
                      </div>
                      <p className="text-xs flex-1 truncate" style={{ color: '#0A0A0A' }}>
                        <span className="font-medium">{item.author_name}</span>
                        {' · '}
                        <span style={{ color: '#6B6B6B' }}>{item.account_name}</span>
                      </p>
                      <span className="text-[10px] shrink-0" style={{ color: '#9B9B9B' }}>{timeAgo(item.created_at)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ROW 4 — CTA if empty portfolio */}
            {!desktopLoading && portfolio.length === 0 && (
              <div className="bg-white rounded-2xl px-8 py-10 flex flex-col items-center text-center"
                style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: '#F5F5F5' }}>
                  <Plus className="w-7 h-7" style={{ color: '#2563EB' }} />
                </div>
                <h3 className="text-lg font-semibold mb-1" style={{ color: '#0A0A0A' }}>Commencez votre portefeuille</h3>
                <p className="text-sm mb-5 max-w-sm" style={{ color: '#6B6B6B' }}>
                  Ajoutez votre premier client ou prospect pour profiter de toutes les fonctionnalités Maimoo.
                </p>
                <button
                  onClick={() => router.push('/app/portfolio')}
                  className="px-6 py-2.5 text-white text-sm font-medium rounded-xl transition-all duration-200"
                  style={{ background: '#2563EB' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1D4ED8' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#2563EB' }}
                >
                  Ajouter ma première entreprise →
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

    </div>
  )
}

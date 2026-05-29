'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FileText, Mic, Type, ChevronRight, Upload, Users, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { SearchBar } from '@/components/ui/SearchBar'
import { getAvatarColor, getInitials } from '@/components/ui/CompanyCard'

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
  return <div className={`bg-[#EEF2FF] animate-pulse rounded-xl ${className ?? ''}`} />
}

export default function DashboardPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()

  /* mobile state */
  const [recentAccounts, setRecentAccounts] = useState<{ id: string; name: string }[]>([])
  const [mobileItems, setMobileItems] = useState<MobileItem[]>([])
  const [time, setTime] = useState(formatTime())

  /* desktop state */
  const [stats, setStats] = useState<Stats>({ accounts: 0, notes: 0, docs: 0, team: 0, notesWeek: 0, accountsWeek: 0 })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [desktopLoading, setDesktopLoading] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 60000)
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

    Promise.all([
      supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('notes').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_deleted', false),
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_deleted', false),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('notes').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_deleted', false).gte('created_at', weekAgo),
      supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('company_id', cid).gte('created_at', weekAgo),
      supabase.from('notes').select('id, title, content, account_id, source, created_at, user_id').eq('company_id', cid).eq('is_deleted', false).order('created_at', { ascending: false }).limit(8),
      supabase.from('documents').select('id, title, file_name, file_type, account_id, created_at, user_id').eq('company_id', cid).eq('is_deleted', false).order('created_at', { ascending: false }).limit(4),
      supabase.from('portfolio').select('id, account_id, accounts(id, name, status)').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(4),
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
  }, [profileLoading, profile])

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  const handleSearch = (q: string) => router.push(`/app/search?q=${encodeURIComponent(q)}`)

  const statCards = [
    {
      label: 'Entreprises', value: stats.accounts,
      icon: Building2, iconColor: '#4C6EF5', iconBg: 'rgba(76,110,245,0.1)',
      delta: stats.accountsWeek > 0 ? `+${stats.accountsWeek} cette semaine` : null,
    },
    {
      label: 'Notes', value: stats.notes,
      icon: FileText, iconColor: '#10B981', iconBg: 'rgba(16,185,129,0.1)',
      delta: stats.notesWeek > 0 ? `+${stats.notesWeek} cette semaine` : null,
    },
    {
      label: 'Documents', value: stats.docs,
      icon: Upload, iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.1)',
      delta: null,
    },
    {
      label: 'Membres', value: stats.team,
      icon: Users, iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.1)',
      delta: null,
    },
  ]

  return (
    <div className="flex flex-col min-h-full overflow-x-hidden">

      {/* ── MOBILE HEADER ── */}
      <header className="md:hidden bg-white px-5 py-3.5 flex items-center justify-between sticky top-0 z-30"
        style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}>
        <button onClick={() => router.push('/app/dashboard')} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}>
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="font-extrabold text-[#1E2761] text-sm" style={{ letterSpacing: '0.15em' }}>MAIMO</span>
        </button>
        {profile && (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}>
            {profile.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
          </div>
        )}
      </header>

      {/* ── MOBILE BODY ── */}
      <div className="md:hidden flex-1 p-5 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight">{greeting()} {firstName} 👋</h1>
          <p className="text-sm text-slate-400 mt-0.5">{time} · {formatDate()}</p>
        </div>
        <div className="mb-6">
          <SearchBar large onSubmit={handleSearch} onVoiceResult={handleSearch} />
        </div>
        {recentAccounts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Accès rapide</h2>
            <div className="space-y-2">
              {recentAccounts.map((acc) => (
                <button key={acc.id} onClick={() => router.push(`/app/accounts/${acc.id}`)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 hover:-translate-y-0.5 transition-all duration-200"
                  style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06)' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(76,110,245,0.1)' }}>
                    <Building2 className="w-4 h-4 text-[#4C6EF5]" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-[#0F172A] text-left truncate">{acc.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
        {mobileItems.length > 0 && (
          <div>
            <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Récent</h2>
            <div className="space-y-2">
              {mobileItems.map((item) => (
                <button key={`${item.kind}-${item.id}`} onClick={() => router.push(`/app/accounts/${item.account_id}`)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 hover:-translate-y-0.5 transition-all duration-200"
                  style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06)' }}>
                  {item.kind === 'note' ? (
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: item.source === 'vocal' ? 'rgba(239,68,68,0.1)' : 'rgba(76,110,245,0.1)' }}>
                      {item.source === 'vocal' ? <Mic className="w-4 h-4 text-red-500" /> : <Type className="w-4 h-4 text-[#4C6EF5]" />}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(139,92,246,0.1)' }}>
                      <FileText className="w-4 h-4 text-purple-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-[#0F172A] truncate">
                      {item.kind === 'note' ? (item.title ?? item.content.slice(0, 40)) : (item.title ?? item.file_name)}
                    </p>
                    <p className="text-xs text-slate-400">{item.account_name} · {timeAgo(item.created_at)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
        {!profileLoading && recentAccounts.length === 0 && mobileItems.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(76,110,245,0.1)' }}>
              <span className="text-2xl font-bold text-[#1E2761]">M</span>
            </div>
            <p className="text-[#0F172A] font-medium mb-1">Bienvenue sur MAIMO</p>
            <p className="text-sm text-slate-400">Posez votre première question ou créez votre première fiche.</p>
          </div>
        )}
      </div>

      {/* ── DESKTOP BODY ── */}
      <div className="hidden md:flex flex-col min-h-full">

        {/* Hero */}
        <div className="relative px-4 md:px-10 pt-6 md:pt-10 pb-12 md:pb-16 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0F1F5C 0%, #1E2761 40%, #2D3F8F 70%, #4C6EF5 100%)' }}>
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
          <div className="max-w-7xl mx-auto relative">
            <div className="flex items-end justify-between mb-6">
              <div>
                <p
                  className="font-extrabold text-white/60 text-xs mb-2 uppercase"
                  style={{ letterSpacing: '0.2em', textShadow: '0 2px 20px rgba(76,110,245,0.4)' }}
                >
                  MAIMO
                </p>
                <h1 className="text-3xl font-semibold text-white tracking-tight">
                  {greeting()}, {firstName} 👋
                </h1>
                <p className="text-white/50 text-sm mt-1">{capitalize(formatDate())} · {time}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                <span className="text-white text-sm font-semibold">
                  {profile?.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
              </div>
            </div>
            <div className="max-w-2xl">
              <SearchBar large onSubmit={handleSearch} onVoiceResult={handleSearch} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 bg-[#F0F4FF] px-4 md:px-10 py-6 md:py-8 -mt-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* ROW 1 — Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {statCards.map(({ label, value, icon: Icon, iconColor, iconBg, delta }) => (
                <div
                  key={label}
                  className="bg-white rounded-2xl p-5 cursor-default transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    border: '1px solid rgba(30,39,97,0.08)',
                    boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(30,39,97,0.10), 0 8px 24px rgba(30,39,97,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)'
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: iconBg }}>
                    <Icon className="w-5 h-5" style={{ color: iconColor }} />
                  </div>
                  {desktopLoading
                    ? <Skeleton className="h-9 w-16 mb-1" />
                    : <p className="text-3xl font-bold text-[#0F172A] tracking-tight">{value}</p>
                  }
                  <p className="text-sm text-slate-500 mt-0.5">{label}</p>
                  {delta && !desktopLoading && (
                    <p className="text-xs text-emerald-600 font-medium mt-1.5">{delta}</p>
                  )}
                </div>
              ))}
            </div>

            {/* ROW 2 — Activity + Portfolio/Team */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Activity feed — 3/5 */}
              <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)' }}>
                <div className="flex items-center justify-between px-6 py-4"
                  style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
                  <h2 className="font-semibold text-[#0F172A]">Activité récente</h2>
                  <button onClick={() => router.push('/app/accounts')} className="text-xs text-[#4C6EF5] hover:underline font-medium">
                    Tout voir →
                  </button>
                </div>
                {desktopLoading ? (
                  <div className="divide-y divide-[rgba(30,39,97,0.04)]">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-3.5">
                        <Skeleton className="w-8 h-8 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-3/4" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                        <Skeleton className="h-3 w-12 shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <FileText className="w-8 h-8 mb-2 text-slate-200" />
                    <p className="text-sm">Aucune activité récente</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[rgba(30,39,97,0.04)]">
                    {activity.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => router.push(`/app/accounts/${item.account_id}`)}
                        className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-[#F0F4FF] transition-colors duration-150 text-left"
                      >
                        {item.type === 'note' ? (
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: item.source === 'vocal' ? 'rgba(239,68,68,0.1)' : 'rgba(76,110,245,0.1)' }}>
                            {item.source === 'vocal' ? <Mic className="w-4 h-4 text-red-500" /> : <Type className="w-4 h-4 text-[#4C6EF5]" />}
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(139,92,246,0.1)' }}>
                            <Upload className="w-4 h-4 text-purple-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#0F172A] truncate">
                            <span className="font-medium">{item.author_name}</span>
                            {item.type === 'note' ? ' a ajouté une note sur ' : ' a partagé un document sur '}
                            <span className="font-medium">{item.account_name}</span>
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{item.label}</p>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0 ml-2">{timeAgo(item.created_at)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right col — Portfolio + Team — 2/5 */}
              <div className="col-span-1 lg:col-span-2 flex flex-col gap-5">

                {/* Portfolio card */}
                <div className="bg-white rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)' }}>
                  <div className="flex items-center justify-between px-5 py-4"
                    style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
                    <h2 className="font-semibold text-[#0F172A]">Mon portefeuille</h2>
                    <div className="flex items-center gap-3">
                      <button onClick={() => router.push('/app/import')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#4C6EF5] transition-colors duration-150 font-medium">
                        <Upload className="w-3 h-3" />Importer
                      </button>
                      <button onClick={() => router.push('/app/portfolio')} className="text-xs text-[#4C6EF5] hover:underline font-medium">Voir tout →</button>
                    </div>
                  </div>
                  {desktopLoading ? (
                    <div className="divide-y divide-[rgba(30,39,97,0.04)]">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-5 py-3">
                          <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                        </div>
                      ))}
                    </div>
                  ) : portfolio.length === 0 ? (
                    <div className="px-5 py-6 text-center">
                      <p className="text-sm text-slate-400">Portefeuille vide</p>
                      <button onClick={() => router.push('/app/portfolio')} className="mt-2 text-xs text-[#4C6EF5] hover:underline">Ajouter des entreprises →</button>
                    </div>
                  ) : (
                    <div className="divide-y divide-[rgba(30,39,97,0.04)]">
                      {portfolio.map((item) => {
                        const color = getAvatarColor(item.account_name)
                        return (
                          <button
                            key={item.id}
                            onClick={() => router.push(`/app/accounts/${item.account_id}`)}
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#F0F4FF] transition-colors duration-150 text-left"
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${color.bg} ${color.text}`}>
                              {getInitials(item.account_name)}
                            </div>
                            <span className="flex-1 text-sm font-medium text-[#0F172A] truncate">{item.account_name}</span>
                            <span
                              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                              style={item.status === 'prospect' ? {
                                background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                                color: '#92400E',
                                borderColor: 'rgba(245,158,11,0.2)',
                              } : {
                                background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                                color: '#065F46',
                                borderColor: 'rgba(16,185,129,0.2)',
                              }}
                            >
                              {item.status === 'prospect' ? 'Prospect' : 'Client'}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Team card */}
                <div className="bg-white rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)' }}>
                  <div className="flex items-center justify-between px-5 py-4"
                    style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
                    <h2 className="font-semibold text-[#0F172A]">Équipe</h2>
                    <button onClick={() => router.push('/app/team')} className="text-xs text-[#4C6EF5] hover:underline font-medium">Voir tout →</button>
                  </div>
                  {desktopLoading ? (
                    <div className="divide-y divide-[rgba(30,39,97,0.04)]">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-5 py-3">
                          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-[rgba(30,39,97,0.04)]">
                      {team.map((member) => {
                        const initials = member.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
                        return (
                          <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'linear-gradient(135deg, rgba(30,39,97,0.1), rgba(76,110,245,0.1))' }}>
                              <span className="text-xs font-semibold text-[#1E2761]">{initials}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#0F172A] truncate">{member.full_name}</p>
                              <p className="text-xs text-slate-400">
                                {member.portfolio_count} entreprise{member.portfolio_count !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <span
                              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                              style={member.role === 'admin' ? {
                                background: 'linear-gradient(135deg, #EDE9FE, #DDD6FE)',
                                color: '#4C1D95',
                                borderColor: 'rgba(139,92,246,0.2)',
                              } : {
                                background: '#F8FAFC',
                                color: '#64748B',
                                borderColor: 'rgba(30,39,97,0.08)',
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
            </div>

            {/* ROW 3 — CTA if empty portfolio */}
            {!desktopLoading && portfolio.length === 0 && (
              <div className="bg-white rounded-2xl px-8 py-10 flex flex-col items-center text-center"
                style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(76,110,245,0.1)' }}>
                  <Plus className="w-7 h-7 text-[#4C6EF5]" />
                </div>
                <h3 className="text-lg font-semibold text-[#0F172A] mb-1">Commencez votre portefeuille</h3>
                <p className="text-sm text-slate-400 mb-5 max-w-sm">
                  Ajoutez votre premier client ou prospect pour profiter de toutes les fonctionnalités MAIMO.
                </p>
                <button
                  onClick={() => router.push('/app/portfolio')}
                  className="px-6 py-2.5 text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-sm hover:brightness-110 hover:-translate-y-px"
                  style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}
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

'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Building2, FileText, Mic, MicOff, Type, ChevronRight, Upload, Users, Plus, Search, X, Sparkles, CloudUpload, Pencil, Maximize2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { getInitials } from '@/components/ui/CompanyCard'
import { Modal } from '@/components/ui/Modal'
import type { MapAccount } from '@/components/AccountsMap'
import { CompanyProfileBanner } from '@/components/ui/CompanyProfileBanner'
import { ActionCard, AddActionMenu, toCleanAction, type EditableAction, type EditableCreateCompany } from '@/components/notes/NoteInput'

const AccountsMap = dynamic(() => import('@/components/AccountsMap'), { ssr: false, loading: () => <div className="w-full h-full bg-gray-100 animate-pulse rounded-xl" /> })

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
  const { accentColor } = useAccentColor()
  const { wsId } = useWorkspace()

  /* mobile state */
  const [recentAccounts, setRecentAccounts] = useState<{ id: string; name: string }[]>([])
  const [mobileItems, setMobileItems] = useState<MobileItem[]>([])
  const [time, setTime] = useState(formatTime())

  /* client search */
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; name: string; city: string | null; status: string }[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [showClientDrop, setShowClientDrop] = useState(false)
  const clientSearchRef = useRef<HTMLDivElement>(null)

  /* note modal state */
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteRecording, setNoteRecording] = useState(false)
  const [notePhase, setNotePhase] = useState<'input' | 'analyzing' | 'confirm' | 'executing' | 'done'>('input')
  const [noteSummary, setNoteSummary] = useState<string[]>([])
  const [noteResults, setNoteResults] = useState<{ type: string; created: boolean; companyId?: string; companyName?: string }[]>([])
  const [noteToast, setNoteToast] = useState('')
  const [noteConfirmActions, setNoteConfirmActions] = useState<EditableAction[]>([])
  const [noteOriginalText, setNoteOriginalText] = useState('')
  const [noteSourceMode, setNoteSourceMode] = useState<'text' | 'vocal'>('text')
  const [noteWsAccounts, setNoteWsAccounts] = useState<{ id: string; name: string }[]>([])
  const [noteShowAddMenu, setNoteShowAddMenu] = useState(false)
  const noteRecognitionRef = useRef<SpeechRecognition | null>(null)

  /* desktop state */
  const [stats, setStats] = useState<Stats>({ accounts: 0, notes: 0, docs: 0, team: 0, notesWeek: 0, accountsWeek: 0 })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [desktopLoading, setDesktopLoading] = useState(true)
  const [mapAccounts, setMapAccounts] = useState<MapAccount[]>([])
  const [mapFullscreen, setMapFullscreen] = useState(false)

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

      // Fetch geocoded accounts for map
      let mapQ = supabase.from('accounts').select('id, name, status, lat, lng').eq('company_id', cid).not('lat', 'is', null)
      if (wf) mapQ = mapQ.or(wf)
      const { data: geoAccounts } = await mapQ
      setMapAccounts(
        ((geoAccounts ?? []) as { id: string; name: string; status: string; lat: number; lng: number }[])
          .filter((a) => a.lat && a.lng)
          .map((a) => ({ id: a.id, name: a.name, status: a.status as 'client' | 'prospect', lat: a.lat, lng: a.lng }))
      )
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

  const handleNoteRecordStart = () => {
    const SR = (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée par ce navigateur."); return }
    const rec = new SR()
    rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let t = ''; for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      setNoteText(t)
    }
    rec.onerror = () => setNoteRecording(false)
    rec.onend = () => setNoteRecording(false)
    noteRecognitionRef.current = rec; rec.start(); setNoteRecording(true)
  }

  const handleNoteRecordStop = () => { noteRecognitionRef.current?.stop(); setNoteRecording(false) }

  const handleNoteSave = async () => {
    if (!noteText.trim() || !profile) return
    setNotePhase('analyzing')
    setNoteOriginalText(noteText)
    setNoteSourceMode(noteRecording ? 'vocal' : 'text')

    try {
      const processRes = await fetch('/api/notes/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText, workspaceId: wsId, userId: profile.id }),
      })
      const { actions } = await processRes.json()

      const supabase = createClient()
      const { data: accs } = await supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name').limit(100)
      setNoteWsAccounts(accs ?? [])

      const editable: EditableAction[] = (actions ?? []).map((a: Record<string, string>, i: number) => {
        const id = `a${i}-${Date.now()}`
        if (a.type === 'create_company') return { id, type: 'create_company', company_name: a.company_name ?? '', city: a.city ?? '', sector: a.sector ?? '', status: (a.status as 'client' | 'prospect') ?? 'prospect' }
        if (a.type === 'create_contact') return { id, type: 'create_contact', first_name: a.first_name ?? '', last_name: a.last_name ?? '', position: a.position ?? '', email: a.email ?? '', phone: a.phone ?? '', company_name: a.company_name ?? '' }
        return { id, type: 'create_note' as const, content: a.content ?? '', company_name: a.company_name ?? '' }
      })

      setNoteConfirmActions(editable)
      setNotePhase('confirm')
    } catch {
      setNotePhase('input')
    }
  }

  const handleNoteExecute = async () => {
    if (!profile) return
    setNotePhase('executing')
    try {
      const executeRes = await fetch('/api/notes/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: noteConfirmActions.map(toCleanAction), workspaceId: wsId, userId: profile.id, source: noteSourceMode }),
      })
      const { results: execResults, summary: execSummary } = await executeRes.json()
      setNoteResults(execResults ?? [])
      setNoteSummary(execSummary ?? [])
      setNotePhase('done')
      setStats((prev) => ({ ...prev, notes: prev.notes + (execResults ?? []).filter((r: { type: string }) => r.type === 'create_note').length }))
    } catch {
      setNotePhase('confirm')
    }
  }

  const handleNoteCancel = () => {
    setNoteText(noteOriginalText)
    setNotePhase('input')
    setNoteConfirmActions([])
    setNoteWsAccounts([])
    setNoteShowAddMenu(false)
  }

  const updateNoteAction = (id: string, updates: Partial<EditableAction>) => {
    setNoteConfirmActions((prev) => prev.map((a) => a.id === id ? { ...a, ...updates } as EditableAction : a))
  }

  const removeNoteAction = (id: string) => {
    setNoteConfirmActions((prev) => prev.filter((a) => a.id !== id))
  }

  const addNoteAction = (type: EditableAction['type']) => {
    const newId = `new-${Date.now()}`
    if (type === 'create_company') setNoteConfirmActions((p) => [...p, { id: newId, type, company_name: '', city: '', sector: '', status: 'prospect' }])
    else if (type === 'create_contact') setNoteConfirmActions((p) => [...p, { id: newId, type, first_name: '', last_name: '', position: '', email: '', phone: '', company_name: '' }])
    else setNoteConfirmActions((p) => [...p, { id: newId, type, content: '', company_name: '' }])
    setNoteShowAddMenu(false)
  }

  const handleNoteReset = () => {
    setNoteText(''); setNotePhase('input'); setNoteSummary([]); setNoteResults([])
    setNoteRecording(false); noteRecognitionRef.current?.stop()
    setNoteConfirmActions([]); setNoteOriginalText(''); setNoteWsAccounts([]); setNoteShowAddMenu(false)
  }

  const noteCompaniesForSelect = [
    ...noteWsAccounts.map((a) => a.name),
    ...noteConfirmActions.filter((a) => a.type === 'create_company').map((a) => (a as EditableCreateCompany).company_name),
  ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i)

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  const clientSearchBox = (
    <div className="relative" ref={clientSearchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Trouver une entreprise..."
          value={clientQuery}
          onChange={(e) => { setClientQuery(e.target.value); setShowClientDrop(true) }}
          onFocus={() => setShowClientDrop(true)}
          onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
          className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
        />
        {clientQuery && (
          <button onMouseDown={() => { setClientQuery(''); setClientResults([]) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showClientDrop && (clientQuery || recentAccounts.length > 0) && (
        <div className="absolute z-40 mt-1 w-full bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden">
          {clientQuery ? (
            clientLoading ? (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                Recherche…
              </div>
            ) : clientResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">Aucune entreprise trouvée</div>
            ) : clientResults.map((acc) => (
              <button key={acc.id} onMouseDown={() => router.push(`/app/accounts/${acc.id}`)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F0F4FF] text-left transition-colors duration-100">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: accentColor }}>
                  {getInitials(acc.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{acc.name}</p>
                  {acc.city && <p className="text-xs text-slate-400">{acc.city}</p>}
                </div>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={acc.status === 'client'
                    ? { background: 'rgba(30,39,97,0.12)', color: '#1E2761' }
                    : { background: 'rgba(30,39,97,0.05)', color: 'rgba(30,39,97,0.5)' }}>
                  {acc.status === 'client' ? 'Client' : 'Prospect'}
                </span>
              </button>
            ))
          ) : (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Récents</p>
              {recentAccounts.map((acc) => (
                <button key={acc.id} onMouseDown={() => router.push(`/app/accounts/${acc.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F0F4FF] text-left transition-colors duration-100">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: accentColor }}>
                    {getInitials(acc.name)}
                  </div>
                  <p className="text-sm font-medium text-[#0F172A] truncate">{acc.name}</p>
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
      icon: Building2, iconColor: '#4C6EF5', iconBg: 'rgba(76,110,245,0.1)',
      delta: stats.accountsWeek > 0 ? `+${stats.accountsWeek} cette semaine` : null,
      href: '/app/accounts',
    },
    {
      label: 'Notes', value: stats.notes,
      icon: FileText, iconColor: '#10B981', iconBg: 'rgba(16,185,129,0.1)',
      delta: stats.notesWeek > 0 ? `+${stats.notesWeek} cette semaine` : null,
      href: '/app/notes',
    },
    {
      label: 'Documents', value: stats.docs,
      icon: Upload, iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.1)',
      delta: null,
      href: '/app/documents',
    },
    {
      label: 'Membres', value: stats.team,
      icon: Users, iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.1)',
      delta: null,
      href: '/app/team',
    },
  ]

  return (
    <div className="flex flex-col min-h-full overflow-x-hidden">

      {/* ── BODY (mobile + desktop) ── */}
      <div className="flex flex-col min-h-full">

        {/* Hero */}
        <div className="relative pl-16 pr-4 md:px-10 pt-5 md:pt-5 pb-8 md:pb-10 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0F1F5C 0%, #1E2761 40%, #2D3F8F 70%, #4C6EF5 100%)' }}>
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
          <div className="max-w-7xl mx-auto relative">
            <div className="flex items-end justify-between">
              <div>
                <p
                  className="font-extrabold text-white/60 text-xs mb-2 uppercase"
                  style={{ letterSpacing: '0.2em', textShadow: '0 2px 20px rgba(76,110,245,0.4)' }}
                >
                  MAIMOO
                </p>
                <h1 className="text-xl md:text-3xl font-semibold text-white tracking-tight">
                  {greeting()}, {firstName} 👋
                </h1>
                <p className="text-white/50 text-sm mt-1">{capitalize(formatDate())} · {time}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                <span className="text-white text-sm font-semibold">
                  {profile?.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 bg-[#F0F4FF] px-3 md:px-10 pt-11 pb-4 md:py-8 -mt-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Actions rapides */}
            <div>
              <p className="text-[13px] font-semibold mb-2" style={{ color: '#8899BB' }}>Actions rapides</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <button
                  onClick={() => router.push('/app/search')}
                  className="col-span-2 md:col-span-1 text-left flex flex-col gap-2 transition-opacity hover:opacity-90 active:opacity-75"
                  style={{ background: '#0A1628', borderRadius: 12, padding: 14 }}
                >
                  <Sparkles className="w-5 h-5 text-white" />
                  <div>
                    <p className="text-[13px] font-medium text-white leading-snug">Recherche IA</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Posez une question sur vos clients</p>
                  </div>
                </button>
                <button
                  onClick={() => { handleNoteReset(); setNoteModalOpen(true) }}
                  className="text-left flex flex-col gap-2 transition-opacity hover:opacity-90 active:opacity-75"
                  style={{ background: '#fff', borderRadius: 12, padding: 14, border: '0.5px solid #C5D0F0' }}
                >
                  <Pencil className="w-5 h-5" style={{ color: '#1E2761' }} />
                  <div>
                    <p className="text-[13px] font-medium leading-snug" style={{ color: '#1E2761' }}>Nouvelle note</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8899BB' }}>Texte ou vocal, client détecté auto</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push('/app/import')}
                  className="text-left flex flex-col gap-2 transition-opacity hover:opacity-90 active:opacity-75"
                  style={{ background: '#EEF2FF', borderRadius: 12, padding: 14, border: '0.5px solid #C5D0F0' }}
                >
                  <CloudUpload className="w-5 h-5" style={{ color: '#4C6EF5' }} />
                  <div>
                    <p className="text-[13px] font-medium leading-snug" style={{ color: '#1E2761' }}>Importer</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8899BB' }}>PDF, Word, Excel, image — classé auto</p>
                  </div>
                </button>
              </div>
              <div className="mt-4" style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', marginBottom: 0 }} />
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
                  className="text-left bg-white rounded-2xl p-3 md:p-5 transition-all duration-150 hover:-translate-y-0.5"
                  style={{
                    border: '1px solid rgba(30,39,97,0.08)',
                    boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.border = '1px solid rgba(30,39,97,0.22)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(30,39,97,0.10), 0 8px 24px rgba(30,39,97,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.border = '1px solid rgba(30,39,97,0.08)'
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)'
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
                </button>
              ))}
            </div>

            {/* ROW 2 — Map + Portfolio/Team */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-5">

              {/* Map — 3/5 */}
              <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl overflow-hidden relative"
                style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)', height: 280 }}>
                <button
                  onClick={() => setMapFullscreen(true)}
                  className="absolute top-2 right-2 z-[400] w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-md hover:bg-gray-50 transition-colors"
                  title="Agrandir"
                >
                  <Maximize2 className="w-4 h-4 text-[#1E2761]" />
                </button>
                {mapAccounts.length === 0 && !desktopLoading ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <p className="text-sm">Aucune entreprise géocodée</p>
                    <p className="text-xs mt-1">Ajoutez une ville dans les fiches clients</p>
                  </div>
                ) : desktopLoading ? (
                  <div className="w-full h-full bg-gray-100 animate-pulse" />
                ) : (
                  <AccountsMap
                    accounts={mapAccounts}
                    onNavigate={(id) => router.push(`/app/accounts/${id}`)}
                    scrollWheelZoom={false}
                    style={{ height: 280 }}
                  />
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
                      {portfolio.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => router.push(`/app/accounts/${item.account_id}`)}
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#F0F4FF] transition-colors duration-150 text-left"
                          >
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
                              style={{ background: accentColor }}>
                              {getInitials(item.account_name)}
                            </div>
                            <span className="flex-1 text-sm font-medium text-[#0F172A] truncate">{item.account_name}</span>
                            <span
                              className="shrink-0 w-2 h-2 rounded-full"
                              style={{ background: item.status === 'client' ? '#10B981' : '#F59E0B' }}
                            />
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          </button>
                        ))}
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

            {/* ROW 3 — Compact Activity */}
            {activity.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}>
                  <h2 className="text-sm font-semibold text-[#0F172A]">Activité récente</h2>
                </div>
                <div className="divide-y divide-[rgba(30,39,97,0.04)]">
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
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#F0F4FF] transition-colors duration-150 text-left"
                    >
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: item.type === 'note' ? (item.source === 'vocal' ? 'rgba(239,68,68,0.1)' : 'rgba(76,110,245,0.1)') : 'rgba(139,92,246,0.1)' }}>
                        {item.type === 'note'
                          ? (item.source === 'vocal' ? <Mic className="w-3 h-3 text-red-500" /> : <Type className="w-3 h-3 text-[#4C6EF5]" />)
                          : <Upload className="w-3 h-3 text-purple-500" />}
                      </div>
                      <p className="text-xs text-[#0F172A] flex-1 truncate">
                        <span className="font-medium">{item.author_name}</span>
                        {item.type === 'note' ? ' · ' : ' · '}
                        <span className="text-slate-400">{item.account_name}</span>
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(item.created_at)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ROW 4 — CTA if empty portfolio */}
            {!desktopLoading && portfolio.length === 0 && (
              <div className="bg-white rounded-2xl px-8 py-10 flex flex-col items-center text-center"
                style={{ border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 1px 3px rgba(30,39,97,0.06)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(76,110,245,0.1)' }}>
                  <Plus className="w-7 h-7 text-[#4C6EF5]" />
                </div>
                <h3 className="text-lg font-semibold text-[#0F172A] mb-1">Commencez votre portefeuille</h3>
                <p className="text-sm text-slate-400 mb-5 max-w-sm">
                  Ajoutez votre premier client ou prospect pour profiter de toutes les fonctionnalités MAIMOO.
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

      {/* Nouvelle note modal */}
      <Modal open={noteModalOpen} onClose={() => { setNoteModalOpen(false); handleNoteRecordStop() }} title="Nouvelle note">
        {notePhase === 'done' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 flex items-center justify-center rounded-full shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <p className="font-semibold text-[#1E293B]">Actions effectuées</p>
            </div>
            <div className="space-y-2.5">
              {noteResults.length === 0 ? (
                <p className="text-sm text-[#94A3B8]">Aucune action détectée.</p>
              ) : noteResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-[#334155]">
                  {!r.created
                    ? <svg className="w-4 h-4 shrink-0 text-[#8899BB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" /></svg>
                    : r.type === 'create_company'
                      ? <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#4C6EF5" strokeWidth={2}><path strokeLinecap="round" d="M3 21h18M9 21V7l6-4v18M9 9H3v12M15 9h6v12" /></svg>
                      : r.type === 'create_contact'
                        ? <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#4C6EF5" strokeWidth={2}><path strokeLinecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /><path strokeLinecap="round" d="M20 8v6m3-3h-6" /></svg>
                        : <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#4C6EF5" strokeWidth={2}><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  }
                  <span>{noteSummary[i] ?? ''}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              {noteResults.find((r) => r.type === 'create_company' && r.companyId)?.companyId && (
                <button
                  onClick={() => { setNoteModalOpen(false); router.push(`/app/accounts/${noteResults.find((r) => r.type === 'create_company')?.companyId}`) }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: '#1E2761' }}
                >
                  Voir la fiche →
                </button>
              )}
              <button
                onClick={() => { handleNoteReset() }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-[#64748B] hover:bg-gray-50 transition-all"
              >
                Nouvelle note
              </button>
            </div>
          </div>
        ) : notePhase === 'confirm' ? (
          <div className="space-y-4">
            <div>
              <p className="text-[15px] font-bold text-[#1E293B]">Vérifier les actions</p>
              <p className="text-[12px] text-[#8899BB] mt-0.5">L&apos;IA a détecté ces actions — modifiez si nécessaire</p>
            </div>
            <div className="space-y-3">
              {noteConfirmActions.length === 0 && (
                <p className="text-sm text-[#94A3B8] py-1">Aucune action détectée automatiquement.</p>
              )}
              {noteConfirmActions.map((action) => (
                <ActionCard key={action.id} action={action} companiesForSelect={noteCompaniesForSelect}
                  onUpdate={updateNoteAction} onRemove={removeNoteAction} />
              ))}
              <AddActionMenu show={noteShowAddMenu} onToggle={() => setNoteShowAddMenu((v) => !v)} onAdd={addNoteAction} />
            </div>
            <div className="space-y-2 pt-1">
              <button onClick={handleNoteExecute}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: '#1E2761' }}>
                Confirmer et enregistrer
              </button>
              <button onClick={handleNoteCancel}
                className="w-full py-1.5 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors text-center">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {(notePhase === 'analyzing' || notePhase === 'executing') ? (
              <div className="flex items-center gap-3 py-4">
                <span className="w-5 h-5 border-2 border-[#1E2761] border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-sm text-[#64748B]">
                  {notePhase === 'analyzing' ? 'Analyse en cours…' : 'Exécution des actions…'}
                </p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <textarea
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Saisir une note ou une instruction…"
                    rows={5}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150 pr-10"
                  />
                  <button
                    type="button"
                    onClick={noteRecording ? handleNoteRecordStop : handleNoteRecordStart}
                    className="absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-150"
                    style={noteRecording ? { background: '#EF4444', color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}
                  >
                    {noteRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleNoteSave}
                  disabled={!noteText.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: '#1E2761' }}
                >
                  Enregistrer la note
                </button>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Fullscreen map modal */}
      {mapFullscreen && (
        <div className="fixed inset-0 z-[9999]" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <button
            onClick={() => setMapFullscreen(false)}
            className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-[#1E2761]" />
          </button>
          <AccountsMap
            accounts={mapAccounts}
            onNavigate={(id) => { setMapFullscreen(false); router.push(`/app/accounts/${id}`) }}
            scrollWheelZoom={true}
            style={{ width: '100vw', height: '100dvh' }}
          />
        </div>
      )}

      {/* Toast */}
      {noteToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl text-sm font-medium text-white shadow-lg"
          style={{ background: '#1E2761' }}>
          {noteToast}
        </div>
      )}
    </div>
  )
}

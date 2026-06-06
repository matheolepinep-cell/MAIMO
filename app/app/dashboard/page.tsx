'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FileText, Mic, MicOff, Type, ChevronRight, Upload, Users, Plus, Search, X, Sparkles, CloudUpload, Pencil, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { getInitials } from '@/components/ui/CompanyCard'
import { Modal } from '@/components/ui/Modal'

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
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteToast, setNoteToast] = useState('')
  const [detectedAccount, setDetectedAccount] = useState<{ id: string; name: string } | null>(null)
  const [detectingAccount, setDetectingAccount] = useState(false)
  const [showAccountSelector, setShowAccountSelector] = useState(false)
  const [accountQuery, setAccountQuery] = useState('')
  const [accountResults, setAccountResults] = useState<{ id: string; name: string }[]>([])
  const noteRecognitionRef = useRef<SpeechRecognition | null>(null)
  const detectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const detectCompanyFromText = useCallback(async (text: string) => {
    if (!text.trim()) { setDetectedAccount(null); return }
    setDetectingAccount(true)
    try {
      const res = await fetch('/api/detect-company-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      setDetectedAccount(data.account_id ? { id: data.account_id, name: data.account_name } : null)
    } catch { /* ignore */ } finally {
      setDetectingAccount(false)
    }
  }, [])

  const handleNoteTextChange = (val: string) => {
    setNoteText(val)
    if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current)
    detectDebounceRef.current = setTimeout(() => detectCompanyFromText(val), 500)
  }

  const handleNoteRecordStart = () => {
    const SR = (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée par ce navigateur."); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let t = ''
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      setNoteText(t)
      if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current)
      detectDebounceRef.current = setTimeout(() => detectCompanyFromText(t), 500)
    }
    rec.onerror = () => setNoteRecording(false)
    rec.onend = () => setNoteRecording(false)
    noteRecognitionRef.current = rec
    rec.start()
    setNoteRecording(true)
  }

  const handleNoteRecordStop = () => {
    noteRecognitionRef.current?.stop()
    setNoteRecording(false)
  }

  const handleNoteSave = async () => {
    if (!noteText.trim() || !profile) return
    setNoteSaving(true)
    const supabase = createClient()
    const today = new Date().toLocaleDateString('fr-FR')
    const clientLabel = detectedAccount?.name ?? 'Sans client'
    const title = `Note du ${today} — ${clientLabel}`

    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        account_id: detectedAccount?.id ?? null,
        company_id: profile.company_id,
        user_id: profile.id,
        title,
        content: noteText.trim(),
        source: noteRecording ? 'vocal' : 'text',
        is_deleted: false,
      })
      .select()
      .single()

    if (error) {
      setNoteSaving(false)
      return
    }

    if (note) {
      fetch('/api/index-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_id: note.id,
          content: note.content,
          account_id: detectedAccount?.id ?? null,
          company_id: profile.company_id,
        }),
      }).catch(console.error)

      setStats((prev) => ({ ...prev, notes: prev.notes + 1 }))
      setNoteText('')
      setDetectedAccount(null)
      setNoteModalOpen(false)
      setNoteToast('Note enregistrée')
      setTimeout(() => setNoteToast(''), 3000)
    }
    setNoteSaving(false)
  }

  useEffect(() => {
    if (!accountQuery.trim() || !profile?.company_id) { setAccountResults([]); return }
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .ilike('name', `%${accountQuery.trim()}%`)
        .order('name')
        .limit(7)
      setAccountResults(data ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [accountQuery, profile])

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
      href: '/app/portfolio',
    },
    {
      label: 'Documents', value: stats.docs,
      icon: Upload, iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.1)',
      delta: null,
      href: '/app/import',
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
                  onClick={() => { setNoteText(''); setDetectedAccount(null); setNoteModalOpen(true) }}
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

            {/* ROW 2 — Activity + Portfolio/Team */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-5">

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
        <div className="space-y-3">
          <div className="relative">
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => handleNoteTextChange(e.target.value)}
              placeholder="Saisir une note..."
              rows={5}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150 pr-10"
            />
            <button
              type="button"
              onClick={noteRecording ? handleNoteRecordStop : handleNoteRecordStart}
              className="absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-150"
              style={noteRecording
                ? { background: '#EF4444', color: '#fff' }
                : { background: '#F1F5F9', color: '#64748B' }}
            >
              {noteRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {/* Detected company badge */}
          <div className="min-h-[28px] flex items-center gap-2">
            {detectingAccount && (
              <span className="text-xs text-[#64748B] flex items-center gap-1">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Détection en cours…
              </span>
            )}
            {!detectingAccount && detectedAccount && !showAccountSelector && (
              <>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(30,39,97,0.08)', color: '#1E2761' }}>
                  <Check className="w-3 h-3" />
                  {detectedAccount.name}
                </span>
                <button
                  onClick={() => { setShowAccountSelector(true); setAccountQuery('') }}
                  className="text-xs text-[#64748B] hover:text-[#1E2761] underline transition-colors"
                >
                  Changer
                </button>
              </>
            )}
            {!detectingAccount && !detectedAccount && !showAccountSelector && noteText.trim() && (
              <button
                onClick={() => { setShowAccountSelector(true); setAccountQuery('') }}
                className="text-xs text-[#64748B] hover:text-[#1E2761] underline transition-colors"
              >
                + Associer à un client
              </button>
            )}
          </div>

          {/* Manual account selector */}
          {showAccountSelector && (
            <div className="relative">
              <input
                autoFocus
                type="text"
                placeholder="Rechercher une entreprise..."
                value={accountQuery}
                onChange={(e) => setAccountQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
              />
              {accountResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
                  {accountResults.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => { setDetectedAccount(acc); setShowAccountSelector(false); setAccountQuery('') }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[#F0F4FF] transition-colors"
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setShowAccountSelector(false); setAccountQuery('') }}
                className="mt-1 text-xs text-[#64748B] hover:text-[#1E2761] underline"
              >
                Annuler
              </button>
            </div>
          )}

          <button
            onClick={handleNoteSave}
            disabled={!noteText.trim() || noteSaving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: '#1E2761' }}
          >
            {noteSaving
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Enregistrement…</span>
              : 'Enregistrer la note'
            }
          </button>
        </div>
      </Modal>

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

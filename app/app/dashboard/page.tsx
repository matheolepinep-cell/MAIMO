'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FileText, Upload, Users, Plus, Search, ChevronRight, Mic, Type, Copy, Check, Key } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Note, Document } from '@/types/database'

interface Stats { accounts: number; notes: number; documents: number; team: number }
interface RecentNote extends Note { account_name?: string; author_name?: string }
interface RecentDoc extends Document { account_name?: string }

function formatDate(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

export default function DashboardPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [stats, setStats] = useState<Stats>({ accounts: 0, notes: 0, documents: 0, team: 0 })
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([])
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    if (profileLoading) return
    const fetch = async () => {
      const supabase = createClient()
      const cid = profile?.company_id

      const [
        { count: accCount },
        { count: noteCount },
        { count: docCount },
        { count: teamCount },
        { data: notes },
        { data: docs },
        { data: company },
      ] = await Promise.all([
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('company_id', cid ?? ''),
        supabase.from('notes').select('id', { count: 'exact', head: true }).eq('company_id', cid ?? '').eq('is_deleted', false),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', cid ?? ''),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('company_id', cid ?? ''),
        supabase.from('notes').select('*').eq('company_id', cid ?? '').eq('is_deleted', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('documents').select('*').eq('company_id', cid ?? '').order('created_at', { ascending: false }).limit(5),
        cid ? supabase.from('companies').select('invite_code').eq('id', cid).single() : { data: null },
      ])

      setStats({ accounts: accCount ?? 0, notes: noteCount ?? 0, documents: docCount ?? 0, team: teamCount ?? 0 })
      if (profile?.role === 'admin') setInviteCode(company?.invite_code ?? null)

      if (notes && notes.length > 0) {
        const accountIds = [...new Set(notes.map((n) => n.account_id))]
        const userIds = [...new Set(notes.map((n) => n.user_id))]
        const [{ data: accounts }, { data: users }] = await Promise.all([
          supabase.from('accounts').select('id, name').in('id', accountIds),
          supabase.from('users').select('id, full_name').in('id', userIds),
        ])
        const accMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.name]))
        const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]))
        setRecentNotes(notes.map((n) => ({ ...n, account_name: accMap[n.account_id], author_name: userMap[n.user_id] })))
      }

      if (docs && docs.length > 0) {
        const accountIds = [...new Set(docs.map((d) => d.account_id))]
        const { data: accounts } = await supabase.from('accounts').select('id, name').in('id', accountIds)
        const accMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.name]))
        setRecentDocs(docs.map((d) => ({ ...d, account_name: accMap[d.account_id] })))
      }

      setLoading(false)
    }
    fetch()
  }, [profileLoading, profile])

  const copyCode = () => {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const statCards = [
    { label: 'Entreprises', value: stats.accounts, icon: Building2, color: 'bg-blue-50 text-blue-600' },
    { label: 'Notes', value: stats.notes, icon: FileText, color: 'bg-green-50 text-green-600' },
    { label: 'Documents', value: stats.documents, icon: Upload, color: 'bg-purple-50 text-purple-600' },
    { label: 'Commerciaux', value: stats.team, icon: Users, color: 'bg-orange-50 text-orange-600' },
  ]

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Dashboard</h1>
          <p className="text-[#64748B] text-sm mt-1">Bonjour {profile?.full_name?.split(' ')[0] ?? ''} 👋</p>
        </div>

        {/* Admin invite code card */}
        {inviteCode && (
          <div className="mb-6 bg-[#1E2761] rounded-2xl p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                <Key className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Code d'invitation de votre espace</p>
                <p className="text-white/60 text-xs">Partagez ce code à vos commerciaux</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/10 rounded-xl px-4 py-2.5 text-center">
                <span className="text-xl font-bold tracking-[0.25em] font-mono text-white">{inviteCode}</span>
              </div>
              <button
                onClick={copyCode}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                  codeCopied ? 'bg-green-500 text-white' : 'bg-white text-[#1E2761] hover:bg-white/90'
                }`}
              >
                {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {codeCopied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-[#1E293B]">
                {loading ? <span className="inline-block w-8 h-6 bg-gray-100 rounded animate-pulse" /> : value}
              </p>
              <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
            </Card>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <Button onClick={() => router.push('/app/accounts')} variant="secondary" className="flex-col h-16 gap-1">
            <Plus className="w-4 h-4" />
            <span className="text-xs">Nouvelle entreprise</span>
          </Button>
          <Button onClick={() => router.push('/app/accounts')} variant="secondary" className="flex-col h-16 gap-1">
            <FileText className="w-4 h-4" />
            <span className="text-xs">Nouvelle note</span>
          </Button>
          <Button onClick={() => router.push('/app/search')} variant="secondary" className="flex-col h-16 gap-1">
            <Search className="w-4 h-4" />
            <span className="text-xs">Rechercher</span>
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent notes */}
          <div>
            <h2 className="text-sm font-semibold text-[#1E293B] mb-3">Notes récentes</h2>
            {loading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : recentNotes.length === 0 ? (
              <p className="text-sm text-[#64748B] text-center py-8">Aucune note</p>
            ) : (
              <div className="space-y-2">
                {recentNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => router.push(`/app/accounts/${note.account_id}`)}
                    className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 cursor-pointer hover:border-gray-200 hover:shadow-sm transition-all duration-150"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${note.source === 'vocal' ? 'bg-red-50' : 'bg-blue-50'}`}>
                      {note.source === 'vocal' ? <Mic className="w-3.5 h-3.5 text-red-500" /> : <Type className="w-3.5 h-3.5 text-[#3B82F6]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1E293B] truncate">{note.title ?? note.content.slice(0, 40)}</p>
                      <p className="text-xs text-[#64748B]">{note.account_name} · {formatDate(note.created_at)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent documents */}
          <div>
            <h2 className="text-sm font-semibold text-[#1E293B] mb-3">Documents récents</h2>
            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : recentDocs.length === 0 ? (
              <p className="text-sm text-[#64748B] text-center py-8">Aucun document</p>
            ) : (
              <div className="space-y-2">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => router.push(`/app/accounts/${doc.account_id}`)}
                    className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 cursor-pointer hover:border-gray-200 hover:shadow-sm transition-all duration-150"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      doc.file_type === 'pdf' ? 'bg-red-50' : doc.file_type === 'docx' ? 'bg-blue-50' : 'bg-green-50'
                    }`}>
                      <Upload className={`w-3.5 h-3.5 ${
                        doc.file_type === 'pdf' ? 'text-red-500' : doc.file_type === 'docx' ? 'text-blue-500' : 'text-green-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1E293B] truncate">{doc.title ?? doc.file_name}</p>
                      <p className="text-xs text-[#64748B]">{doc.account_name} · {formatDate(doc.created_at)}</p>
                    </div>
                    <span className="text-xs font-mono text-[#94A3B8] uppercase shrink-0">{doc.file_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

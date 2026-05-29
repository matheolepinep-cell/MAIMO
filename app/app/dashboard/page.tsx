'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FileText, Mic, Type, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { SearchBar } from '@/components/ui/SearchBar'
import type { Note, Document } from '@/types/database'

type RecentItem =
  | { kind: 'note'; id: string; title: string | null; content: string; account_id: string; account_name: string; source: 'vocal' | 'text'; created_at: string }
  | { kind: 'doc'; id: string; title: string | null; file_name: string; file_type: string; account_id: string; account_name: string; created_at: string }

function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'hier'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d))
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Bonsoir'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bonjour'
  return 'Bonsoir'
}

function formatTime() {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

function formatDate() {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}

export default function DashboardPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [recentAccounts, setRecentAccounts] = useState<{ id: string; name: string }[]>([])
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [time, setTime] = useState(formatTime())

  // Update clock every minute
  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 60000)
    return () => clearInterval(id)
  }, [])

  // Load recently visited from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('maimo_recent_accounts') ?? '[]')
      setRecentAccounts(stored.slice(0, 3))
    } catch { /* empty */ }
  }, [])

  // Load recent activity
  useEffect(() => {
    if (profileLoading || !profile) return
    const supabase = createClient()
    const cid = profile.company_id

    Promise.all([
      supabase.from('notes').select('id, title, content, account_id, source, created_at, user_id').eq('company_id', cid).eq('is_deleted', false).order('created_at', { ascending: false }).limit(5),
      supabase.from('documents').select('id, title, file_name, file_type, account_id, created_at').eq('company_id', cid).eq('is_deleted', false).order('created_at', { ascending: false }).limit(3),
    ]).then(async ([{ data: notes }, { data: docs }]) => {
      const allAccountIds = [
        ...new Set([
          ...(notes ?? []).map((n) => n.account_id),
          ...(docs ?? []).map((d) => d.account_id),
        ])
      ]
      const { data: accounts } = allAccountIds.length > 0
        ? await supabase.from('accounts').select('id, name').in('id', allAccountIds)
        : { data: [] }
      const accMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.name]))

      const items: RecentItem[] = [
        ...(notes ?? []).map((n) => ({ kind: 'note' as const, id: n.id, title: n.title, content: n.content, account_id: n.account_id, account_name: accMap[n.account_id] ?? '—', source: n.source, created_at: n.created_at })),
        ...(docs ?? []).map((d) => ({ kind: 'doc' as const, id: d.id, title: d.title, file_name: d.file_name, file_type: d.file_type, account_id: d.account_id, account_name: accMap[d.account_id] ?? '—', created_at: d.created_at })),
      ]
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setRecentItems(items.slice(0, 5))
    })
  }, [profileLoading, profile])

  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  const handleSearch = (query: string) => {
    router.push(`/app/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Mobile header */}
      <header className="md:hidden bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1E2761] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="font-bold tracking-widest text-[#1E2761] text-sm">MAIMO</span>
        </div>
        {profile && (
          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-semibold text-slate-600">
              {profile.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
            </span>
          </div>
        )}
      </header>

      <div className="flex-1 p-5 md:p-8 max-w-2xl mx-auto w-full">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight">
            {greeting()} {firstName} 👋
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{time} · {formatDate()}</p>
        </div>

        {/* Main search bar */}
        <div className="mb-3">
          <SearchBar
            large
            onSubmit={handleSearch}
            onVoiceResult={handleSearch}
          />
        </div>

        {/* Scope pill */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/app/search')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-xs text-slate-500 hover:bg-slate-200 transition-all duration-200"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#1E2761]" />
            Mon portefeuille
            <span className="text-slate-400">▾</span>
          </button>
        </div>

        {/* Quick access */}
        {recentAccounts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Accès rapide</h2>
            <div className="space-y-2">
              {recentAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => router.push(`/app/accounts/${acc.id}`)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 hover:border-slate-200 hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                >
                  <div className="w-8 h-8 bg-[#1E2761]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-[#1E2761]" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-[#0F172A] text-left truncate">{acc.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {recentItems.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Récent</h2>
            <div className="space-y-2">
              {recentItems.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => router.push(`/app/accounts/${item.account_id}`)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 hover:border-slate-200 hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                >
                  {item.kind === 'note' ? (
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.source === 'vocal' ? 'bg-red-50' : 'bg-blue-50'}`}>
                      {item.source === 'vocal'
                        ? <Mic className="w-4 h-4 text-red-400" />
                        : <Type className="w-4 h-4 text-blue-400" />
                      }
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-purple-400" />
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

        {/* Empty state */}
        {!profileLoading && recentAccounts.length === 0 && recentItems.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-[#1E2761]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-[#1E2761]">M</span>
            </div>
            <p className="text-[#0F172A] font-medium mb-1">Bienvenue sur MAIMO</p>
            <p className="text-sm text-slate-400">Posez votre première question ou créez votre première fiche entreprise.</p>
          </div>
        )}
      </div>
    </div>
  )
}

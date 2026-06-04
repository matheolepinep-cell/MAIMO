'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Trash2, Upload, ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { CompanyCard, getInitials } from '@/components/ui/CompanyCard'
import { AlphaList } from '@/components/ui/AlphaList'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Account } from '@/types/database'

type Filter = 'all' | 'client' | 'prospect'
type Sort = 'az' | 'za' | 'recent' | 'oldest'
type AccountWithOwner = Account & { owner_name?: string | null }

async function getAccessibleAccountIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
  wsId: string | null
): Promise<string[]> {
  let q = supabase
    .from('portfolio')
    .select('id, account_id, user_id, visibility')
    .eq('company_id', companyId)
  if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
  const { data: entries } = await q

  const entryIds = (entries ?? []).map((p: { id: string }) => p.id)
  const { data: myAccess } = entryIds.length > 0
    ? await supabase.from('portfolio_access').select('portfolio_id').in('portfolio_id', entryIds).eq('user_id', userId)
    : { data: [] }
  const myAccessSet = new Set((myAccess ?? []).map((a: { portfolio_id: string }) => a.portfolio_id))

  return (entries ?? [])
    .filter((p: { user_id: string; visibility: string; id: string }) =>
      p.user_id === userId ||
      p.visibility === 'team' ||
      (p.visibility === 'custom' && myAccessSet.has(p.id))
    )
    .map((p: { account_id: string }) => p.account_id)
}

export default function AccountsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor } = useAccentColor()
  const { wsId } = useWorkspace()

  const [accounts, setAccounts] = useState<AccountWithOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('az')
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newIndustry, setNewIndustry] = useState('')
  const [newStatus, setNewStatus] = useState<'client' | 'prospect'>('client')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchAccounts = useCallback(async () => {
    if (!profile?.company_id) return
    const supabase = createClient()

    // Fetch portfolio entries with owner names
    type PfRow = { account_id: string; user_id: string; users: { full_name: string } | null }
    let pfQ = supabase
      .from('portfolio')
      .select('account_id, user_id, users(full_name)')
      .eq('company_id', profile.company_id)
    if (wsId) pfQ = pfQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    const { data: pfEntries } = await pfQ

    const ownerMap: Record<string, string> = {}
    for (const entry of (pfEntries ?? []) as unknown as PfRow[]) {
      if (!ownerMap[entry.account_id] && entry.users?.full_name) {
        const parts = entry.users.full_name.trim().split(' ')
        ownerMap[entry.account_id] = parts.length > 1
          ? `${parts[0]} ${parts[parts.length - 1][0]}.`
          : parts[0]
      }
    }

    let accountIds: string[]
    if (profile.role === 'admin') {
      let q = supabase.from('accounts').select('id').eq('company_id', profile.company_id)
      if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      const { data } = await q
      accountIds = (data ?? []).map((a: { id: string }) => a.id)
    } else {
      accountIds = await getAccessibleAccountIds(supabase, profile.id, profile.company_id, wsId)
    }

    if (accountIds.length === 0) { setAccounts([]); setLoading(false); return }

    const { data } = await supabase
      .from('accounts')
      .select('*')
      .in('id', accountIds)

    setAccounts(
      (data ?? []).map((a) => ({ ...a, owner_name: ownerMap[a.id] ?? null }))
    )
    setLoading(false)
  }, [profile, wsId])

  useEffect(() => {
    if (!profileLoading) fetchAccounts()
  }, [profileLoading, fetchAccounts])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !profile) return
    setCreating(true); setCreateError('')
    const supabase = createClient()

    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .insert({
        name: newName.trim(),
        city: newCity.trim() || null,
        industry: newIndustry.trim() || null,
        status: newStatus,
        company_id: profile.company_id,
        created_by: profile.id,
        workspace_id: wsId ?? null,
      })
      .select().single()

    if (accErr || !acc) { setCreateError(accErr?.message ?? 'Erreur.'); setCreating(false); return }

    await supabase.from('portfolio').insert({
      user_id: profile.id, account_id: acc.id,
      company_id: profile.company_id, visibility: 'team',
      workspace_id: wsId ?? null,
    })

    router.push(`/app/accounts/${acc.id}`)
  }

  const handleDelete = async (accountId: string) => {
    setDeletingId(accountId)
    const supabase = createClient()
    await supabase.from('chunks').delete().eq('account_id', accountId)
    await supabase.from('notes').delete().eq('account_id', accountId)
    await supabase.from('documents').delete().eq('account_id', accountId)
    await supabase.from('contacts').delete().eq('account_id', accountId)
    const { data: pfEntries } = await supabase.from('portfolio').select('id').eq('account_id', accountId)
    const pfIds = (pfEntries ?? []).map((p: { id: string }) => p.id)
    if (pfIds.length > 0) await supabase.from('portfolio_access').delete().in('portfolio_id', pfIds)
    await supabase.from('portfolio').delete().eq('account_id', accountId)
    await supabase.from('accounts').delete().eq('id', accountId)
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setConfirmDeleteId(null)
    setDeletingId(null)
  }

  const filtered = accounts
    .filter((a) => {
      if (filter === 'client') return a.status === 'client'
      if (filter === 'prospect') return a.status === 'prospect'
      return true
    })
    .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'az') return a.name.localeCompare(b.name)
      if (sort === 'za') return b.name.localeCompare(a.name)
      if (sort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return 0
    })

  const clientCount = accounts.filter((a) => a.status === 'client').length
  const prospectCount = accounts.filter((a) => a.status === 'prospect').length

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'client', label: 'Clients' },
    { value: 'prospect', label: 'Prospects' },
  ]

  return (
    <div className="flex flex-col min-h-full overflow-x-hidden">

      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col flex-1">
        <div
          className="flex items-center justify-between px-4 pl-14 py-3 bg-white shrink-0"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}
        >
          <span className="text-[16px] font-bold text-[#0A1628]">Portefeuille global</span>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center justify-center"
            style={{ background: '#F0F4FF', borderRadius: 8, width: 34, height: 34 }}
          >
            <Plus className="text-[#4C6EF5]" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div
          className="flex shrink-0 items-center px-4 py-3 bg-white gap-2"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}
        >
          {filters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={filter === value
                ? { background: '#1E2761', color: 'white' }
                : { background: '#F0F4FF', color: '#8899BB' }}
            >
              {label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="ml-auto text-[11px] text-[#8899BB] bg-transparent border-none focus:outline-none cursor-pointer"
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="recent">Récent</option>
            <option value="oldest">Ancien</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-[10px] py-3">
          {loading ? (
            <div className="space-y-[8px]">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-[52px] bg-white rounded-2xl animate-pulse"
                  style={{ border: '1px solid rgba(30,39,97,0.06)' }} />
              ))}
            </div>
          ) : (
            <AlphaList
              items={filtered.map((acc) => ({ id: acc.id, name: acc.name }))}
              emptyState={
                <div className="text-center py-16">
                  <Briefcase className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Aucune entreprise.</p>
                </div>
              }
              renderItem={(item) => {
                const acc = filtered.find((a) => a.id === item.id)
                if (!acc) return null
                return (
                  <button
                    key={acc.id}
                    onClick={() => router.push(`/app/accounts/${acc.id}`)}
                    className="w-full flex items-center gap-3 bg-white rounded-2xl px-[12px] py-[10px] text-left transition-all duration-150 hover:-translate-y-0.5"
                    style={{ border: '1px solid rgba(30,39,97,0.07)', boxShadow: '0 1px 3px rgba(30,39,97,0.04)' }}
                  >
                    <div
                      className="rounded-full shrink-0"
                      style={{ width: 7, height: 7, background: acc.status === 'client' ? '#22C55E' : '#F59E0B' }}
                    />
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                      style={{ background: accentColor }}
                    >
                      {getInitials(acc.name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-bold text-[#0A1628] truncate">{acc.name}</p>
                      {(acc.city || acc.industry || acc.owner_name) && (
                        <p className="text-[11px] text-[#8899BB] truncate">
                          {[acc.city, acc.industry, acc.owner_name ? `par ${acc.owner_name}` : null].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#C5D0F0' }} />
                  </button>
                )
              }}
            />
          )}
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex flex-col flex-1">
        <Header title="Portefeuille global" />
        <div className="flex-1 px-4 py-4 md:px-8 md:py-8 max-w-2xl mx-auto w-full">

          <Breadcrumb items={[
            { label: 'MAIMOO', href: '/app/dashboard' },
            { label: 'Portefeuille global' },
          ]} />

          {/* Header row */}
          <div className="mb-5">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight hidden md:block">Portefeuille global</h1>
              <div className="flex items-center gap-2 md:ml-4">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="text-[11px] text-[#8899BB] bg-transparent border-none focus:outline-none cursor-pointer"
                >
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                  <option value="recent">Date (récent)</option>
                  <option value="oldest">Date (ancien)</option>
                </select>
                <Button onClick={() => router.push('/app/import')} size="sm" variant="ghost">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Importer
                </Button>
                <Button onClick={() => setCreateOpen(true)} size="sm">
                  <span className="md:hidden">+ Nouveau</span>
                  <span className="hidden md:inline">+ Nouvelle entreprise</span>
                </Button>
              </div>
            </div>
            {!loading && accounts.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-xs text-slate-400">
                  <span className="font-semibold text-[#0F172A]">{accounts.length}</span> entreprise{accounts.length !== 1 ? 's' : ''}
                </span>
                {clientCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={{ background: 'rgba(30,39,97,0.12)', color: '#1E2761', borderColor: 'rgba(30,39,97,0.2)' }}>
                    {clientCount} client{clientCount !== 1 ? 's' : ''}
                  </span>
                )}
                {prospectCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={{ background: 'rgba(30,39,97,0.05)', color: 'rgba(30,39,97,0.5)', borderColor: 'rgba(30,39,97,0.1)' }}>
                    {prospectCount} prospect{prospectCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
            {filters.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150"
                style={filter === value ? {
                  background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)',
                  color: 'white',
                } : {
                  background: 'white',
                  color: '#64748B',
                  border: '1px solid rgba(30,39,97,0.12)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="mb-5">
            <Input
              placeholder="Rechercher une entreprise..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-white rounded-2xl animate-pulse"
                style={{ border: '1px solid rgba(30,39,97,0.06)' }} />
            ))}</div>
          ) : (
            <AlphaList
              items={filtered.map((a) => ({ id: a.id, name: a.name }))}
              emptyState={
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'rgba(76,110,245,0.08)' }}>
                    <Briefcase className="w-6 h-6 text-[#4C6EF5]" />
                  </div>
                  <p className="text-slate-500 text-sm mb-4">
                    {search || filter !== 'all' ? 'Aucune entreprise trouvée.' : 'Aucune entreprise accessible.'}
                  </p>
                  {!search && filter === 'all' && (
                    <Button onClick={() => setCreateOpen(true)} variant="secondary" size="sm">
                      + Créer une entreprise
                    </Button>
                  )}
                </div>
              }
              renderItem={(item) => {
                const account = filtered.find((a) => a.id === item.id)
                if (!account) return null
                const isConfirming = confirmDeleteId === account.id
                const isDeleting = deletingId === account.id

                if (isConfirming) {
                  return (
                    <div
                      key={account.id}
                      className="bg-white rounded-2xl p-4 flex items-center gap-3"
                      style={{ border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 1px 3px rgba(30,39,97,0.06)' }}
                    >
                      <p className="text-sm text-red-500 font-medium flex-1">Supprimer définitivement ?</p>
                      <button
                        onClick={() => handleDelete(account.id)}
                        disabled={isDeleting}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-60"
                      >
                        {isDeleting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        Oui, supprimer
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-all"
                      >
                        Annuler
                      </button>
                    </div>
                  )
                }

                return (
                  <CompanyCard
                    key={account.id}
                    name={account.name}
                    city={account.city}
                    industry={account.industry}
                    status={account.status}
                    subtitle={account.owner_name ? `par ${account.owner_name}` : null}
                    onClick={() => router.push(`/app/accounts/${account.id}`)}
                    rightSlot={
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(account.id) }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all duration-200 shrink-0"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    }
                  />
                )
              }}
            />
          )}
        </div>
      </div>

      <BottomSheet open={createOpen} onClose={() => { setCreateOpen(false); setCreateError('') }} title="Nouvelle entreprise">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input id="acc-name" label="Raison sociale" placeholder="Entreprise Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <Input id="acc-city" label="Ville (optionnel)" placeholder="Lyon" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          <Input id="acc-industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Statut</label>
            <div className="flex rounded-xl bg-[#F0F4FF] p-1">
              <button type="button" onClick={() => setNewStatus('client')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${newStatus === 'client' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500'}`}>Client</button>
              <button type="button" onClick={() => setNewStatus('prospect')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${newStatus === 'prospect' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500'}`}>Prospect</button>
            </div>
          </div>
          {createError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{createError}</p>}
          <p className="text-xs text-slate-400">Visible par toute l'équipe par défaut.</p>
          <div className="flex gap-2 pb-2">
            <Button variant="secondary" type="button" onClick={() => { setCreateOpen(false); setCreateError('') }} className="flex-1">Annuler</Button>
            <Button type="submit" loading={creating} className="flex-1">Créer</Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  )
}

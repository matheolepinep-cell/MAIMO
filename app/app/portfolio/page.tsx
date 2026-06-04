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
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

type PortfolioEntry = {
  id: string
  account_id: string
  visibility: 'team' | 'private' | 'custom'
  created_at: string
  accounts: { id: string; name: string; city: string | null; industry: string | null; status: 'client' | 'prospect' } | null
}

type Filter = 'all' | 'client' | 'prospect' | 'team' | 'private'

type GlobalAccount = { id: string; name: string; city: string | null; industry: string | null; status: 'client' | 'prospect' }

export default function PortfolioPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor } = useAccentColor()
  const { wsId } = useWorkspace()
  const [entries, setEntries] = useState<PortfolioEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [portfolioSort, setPortfolioSort] = useState<'az' | 'za' | 'recent' | 'oldest'>('az')

  // Mobile tab: 'perso' | 'global'
  const [mobileTab, setMobileTab] = useState<'perso' | 'global'>('perso')
  const [globalAccounts, setGlobalAccounts] = useState<GlobalAccount[]>([])
  const [globalLoading, setGlobalLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newIndustry, setNewIndustry] = useState('')
  const [newStatus, setNewStatus] = useState<'client' | 'prospect'>('client')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchEntries = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()
    let q = supabase
      .from('portfolio')
      .select('id, account_id, visibility, created_at, accounts(id, name, city, industry, status)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    if (wsId) q = q.or(`workspace_id.eq.${wsId},workspace_id.is.null`) as typeof q
    const { data } = await q
    setEntries((data as unknown as PortfolioEntry[]) ?? [])
    setLoading(false)
  }, [profile, wsId])

  useEffect(() => {
    if (!profileLoading) fetchEntries()
  }, [profileLoading, fetchEntries])

  useEffect(() => {
    if (mobileTab !== 'global' || !profile) return
    setGlobalLoading(true)
    const supabase = createClient()
    supabase
      .from('accounts')
      .select('id, name, city, industry, status')
      .eq('company_id', profile.company_id)
      .order('name')
      .then(({ data }) => {
        setGlobalAccounts((data ?? []) as GlobalAccount[])
        setGlobalLoading(false)
      })
  }, [mobileTab, profile])

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
      })
      .select().single()

    if (accErr || !acc) { setCreateError(accErr?.message ?? 'Erreur.'); setCreating(false); return }

    await supabase.from('portfolio').insert({
      user_id: profile.id, account_id: acc.id, company_id: profile.company_id, visibility: 'team',
      workspace_id: wsId ?? null,
    })

    router.push(`/app/accounts/${acc.id}`)
  }

  const handleRemove = async (entryId: string) => {
    const supabase = createClient()
    await supabase.from('portfolio').delete().eq('id', entryId)
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  const filtered = entries.filter((e) => {
    const acc = e.accounts
    if (!acc) return false
    if (filter === 'client') return acc.status === 'client'
    if (filter === 'prospect') return acc.status === 'prospect'
    if (filter === 'team') return e.visibility === 'team'
    if (filter === 'private') return e.visibility === 'private'
    return true
  }).sort((a, b) => {
    if (portfolioSort === 'az') return (a.accounts?.name ?? '').localeCompare(b.accounts?.name ?? '')
    if (portfolioSort === 'za') return (b.accounts?.name ?? '').localeCompare(a.accounts?.name ?? '')
    if (portfolioSort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (portfolioSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return 0
  })

  const clientCount = entries.filter((e) => e.accounts?.status === 'client').length
  const prospectCount = entries.filter((e) => e.accounts?.status === 'prospect').length

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'client', label: 'Clients' },
    { value: 'prospect', label: 'Prospects' },
    { value: 'team', label: 'Équipe' },
    { value: 'private', label: 'Privés' },
  ]

  const mobilePersoAccounts = [...entries]
    .sort((a, b) => {
      if (portfolioSort === 'az') return (a.accounts?.name ?? '').localeCompare(b.accounts?.name ?? '')
      if (portfolioSort === 'za') return (b.accounts?.name ?? '').localeCompare(a.accounts?.name ?? '')
      if (portfolioSort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (portfolioSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return 0
    })
    .map((e) => e.accounts)
    .filter(Boolean) as { id: string; name: string; city: string | null; industry: string | null; status: 'client' | 'prospect' }[]

  const mobileDisplayAccounts = mobileTab === 'perso' ? mobilePersoAccounts : [...globalAccounts].sort((a, b) => {
    if (portfolioSort === 'za') return b.name.localeCompare(a.name)
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-col min-h-full overflow-x-hidden">

      {/* ── MOBILE SECTION ── */}
      <div className="md:hidden flex flex-col flex-1">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pl-14 py-3 bg-white shrink-0"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}
        >
          <span className="text-[16px] font-bold text-[#0A1628]">Portefeuille</span>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center justify-center"
            style={{ background: '#F0F4FF', borderRadius: 8, width: 34, height: 34 }}
          >
            <Plus className="text-[#4C6EF5]" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Tabs + sort */}
        <div
          className="flex shrink-0 items-center px-4 py-3 bg-white gap-2"
          style={{ borderBottom: '1px solid rgba(30,39,97,0.06)' }}
        >
          {(['perso', 'global'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={mobileTab === tab
                ? { background: '#1E2761', color: 'white' }
                : { background: '#F0F4FF', color: '#8899BB' }}
            >
              {tab === 'perso' ? 'Perso' : 'Global'}
            </button>
          ))}
          <select
            value={portfolioSort}
            onChange={(e) => setPortfolioSort(e.target.value as 'az' | 'za' | 'recent' | 'oldest')}
            className="ml-auto text-[11px] text-[#8899BB] bg-transparent border-none focus:outline-none cursor-pointer"
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="recent">Récent</option>
            <option value="oldest">Ancien</option>
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-[10px] py-3 space-y-[8px]">
          {(loading || globalLoading) ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-[52px] bg-white rounded-2xl animate-pulse"
                style={{ border: '1px solid rgba(30,39,97,0.06)' }} />
            ))
          ) : mobileDisplayAccounts.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {mobileTab === 'perso' ? 'Votre portefeuille est vide.' : 'Aucune entreprise.'}
              </p>
            </div>
          ) : mobileDisplayAccounts.map((acc) => {
            const entryId = mobileTab === 'perso'
              ? entries.find((e) => e.accounts?.id === acc.id)?.id
              : undefined
            return (
              <button
                key={acc.id}
                onClick={() => router.push(`/app/accounts/${acc.id}`)}
                className="w-full flex items-center gap-3 bg-white rounded-2xl px-[12px] py-[10px] text-left transition-all duration-150 hover:-translate-y-0.5"
                style={{ border: '1px solid rgba(30,39,97,0.07)', boxShadow: '0 1px 3px rgba(30,39,97,0.04)' }}
              >
                {/* Status dot */}
                <div
                  className="rounded-full shrink-0"
                  style={{ width: 7, height: 7, background: acc.status === 'client' ? '#22C55E' : '#F59E0B' }}
                />
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: accentColor }}
                >
                  {getInitials(acc.name)}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-bold text-[#0A1628] truncate">{acc.name}</p>
                  {(acc.city || acc.industry) && (
                    <p className="text-[11px] text-[#8899BB] truncate">
                      {[acc.city, acc.industry].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#C5D0F0' }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── DESKTOP SECTION ── */}
      <div className="hidden md:flex flex-col flex-1">
      <Header title="Mon portefeuille" />
      <div className="flex-1 px-4 py-4 md:px-8 md:py-8 max-w-2xl mx-auto w-full">

        <Breadcrumb items={[
          { label: 'MAIMOO', href: '/app/dashboard' },
          { label: 'Mon portefeuille' },
        ]} />

        {/* Header row */}
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight hidden md:block">Mon portefeuille</h1>
            <div className="flex items-center gap-2 md:ml-4">
              <select
                value={portfolioSort}
                onChange={(e) => setPortfolioSort(e.target.value as 'az' | 'za' | 'recent' | 'oldest')}
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
          {!loading && entries.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-xs text-slate-400">
                <span className="font-semibold text-[#0F172A]">{entries.length}</span> entreprise{entries.length !== 1 ? 's' : ''}
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
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
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

        {/* Content */}
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse"
              style={{ border: '1px solid rgba(30,39,97,0.06)' }} />
          ))}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(76,110,245,0.08)' }}>
              <Briefcase className="w-6 h-6 text-[#4C6EF5]" />
            </div>
            <p className="text-slate-500 text-sm mb-4">
              {filter !== 'all' ? 'Aucune entreprise dans ce filtre.' : 'Votre portefeuille est vide.'}
            </p>
            {filter === 'all' && (
              <Button onClick={() => setCreateOpen(true)} variant="secondary" size="sm">
                + Créer une entreprise
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((entry) => {
              const acc = entry.accounts
              if (!acc) return null
              return (
                <CompanyCard
                  key={entry.id}
                  name={acc.name}
                  city={acc.city}
                  industry={acc.industry}
                  status={acc.status}
                  visibility={entry.visibility}
                  onClick={() => router.push(`/app/accounts/${entry.account_id}`)}
                  rightSlot={
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(entry.id) }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all duration-200"
                        title="Retirer du portefeuille"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  }
                />
              )
            })}
          </div>
        )}
      </div>

      </div>{/* end desktop inner */}

      <BottomSheet open={createOpen} onClose={() => { setCreateOpen(false); setCreateError('') }} title="Nouvelle entreprise">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input id="name" label="Raison sociale" placeholder="Entreprise Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <Input id="city" label="Ville (optionnel)" placeholder="Lyon" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          <Input id="industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} />
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

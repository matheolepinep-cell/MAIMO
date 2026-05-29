'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { CompanyCard } from '@/components/ui/CompanyCard'

type PortfolioEntry = {
  id: string
  account_id: string
  visibility: 'team' | 'private' | 'custom'
  created_at: string
  accounts: { id: string; name: string; city: string | null; industry: string | null; status: 'client' | 'prospect' } | null
}

type Filter = 'all' | 'client' | 'prospect' | 'team' | 'private'

export default function PortfolioPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [entries, setEntries] = useState<PortfolioEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

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
    const { data } = await supabase
      .from('portfolio')
      .select('id, account_id, visibility, created_at, accounts(id, name, city, industry, status)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setEntries((data as unknown as PortfolioEntry[]) ?? [])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    if (!profileLoading) fetchEntries()
  }, [profileLoading, fetchEntries])

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

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Mon portefeuille" />
      <div className="flex-1 p-4 md:p-8 max-w-2xl mx-auto w-full">

        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight hidden md:block">Mon portefeuille</h1>
            {!loading && entries.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate-400">
                  <span className="font-semibold text-[#0F172A]">{entries.length}</span> entreprise{entries.length !== 1 ? 's' : ''}
                </span>
                {clientCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{clientCount} client{clientCount !== 1 ? 's' : ''}</span>}
                {prospectCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">{prospectCount} prospect{prospectCount !== 1 ? 's' : ''}</span>}
              </div>
            )}
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="shrink-0 ml-4">
            + Nouvelle entreprise
          </Button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
          {filters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                filter === value ? 'bg-[#1E2761] text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-6 h-6 text-slate-300" />
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

      {/* Create sheet */}
      <BottomSheet open={createOpen} onClose={() => { setCreateOpen(false); setCreateError('') }} title="Nouvelle entreprise">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input id="name" label="Raison sociale" placeholder="Entreprise Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <Input id="city" label="Ville (optionnel)" placeholder="Lyon" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          <Input id="industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Statut</label>
            <div className="flex rounded-xl bg-slate-100 p-1">
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

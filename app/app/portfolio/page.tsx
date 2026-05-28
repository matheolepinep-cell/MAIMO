'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, Building2, ChevronRight, Lock, Globe, Users, Trash2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

type AccountRow = { id: string; name: string; city: string | null; industry: string | null; status: 'client' | 'prospect' }
type PortfolioEntry = {
  id: string
  account_id: string
  visibility: 'team' | 'private' | 'custom'
  created_at: string
  accounts: AccountRow | null
}

const VISIBILITY_ICON = { team: Globe, private: Lock, custom: Users }
const VISIBILITY_LABEL = { team: "Toute l'équipe", private: 'Privé', custom: 'Personnes choisies' }

export default function PortfolioPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [entries, setEntries] = useState<PortfolioEntry[]>([])
  const [loading, setLoading] = useState(true)

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
      user_id: profile.id,
      account_id: acc.id,
      company_id: profile.company_id,
      visibility: 'team',
    })

    router.push(`/app/accounts/${acc.id}`)
  }

  const handleRemove = async (entryId: string) => {
    const supabase = createClient()
    await supabase.from('portfolio').delete().eq('id', entryId)
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  const clientCount = entries.filter((e) => e.accounts?.status === 'client').length
  const prospectCount = entries.filter((e) => e.accounts?.status === 'prospect').length

  return (
    <div>
      <Header title="Mon portefeuille" />
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Mon portefeuille</h1>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="ml-auto">
            <Plus className="w-4 h-4 mr-1.5" />Nouvelle entreprise
          </Button>
        </div>

        {!loading && entries.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm text-[#64748B]">
              <span className="font-semibold text-[#1E293B]">{entries.length}</span> entreprise{entries.length !== 1 ? 's' : ''}
            </span>
            {clientCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{clientCount} client{clientCount !== 1 ? 's' : ''}</span>}
            {prospectCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">{prospectCount} prospect{prospectCount !== 1 ? 's' : ''}</span>}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#64748B] mb-4">Votre portefeuille est vide.</p>
            <Button onClick={() => setCreateOpen(true)} variant="secondary" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />Créer une entreprise
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const acc = entry.accounts
              if (!acc) return null
              const vis = entry.visibility ?? 'team'
              const VisIcon = VISIBILITY_ICON[vis]
              return (
                <Card key={entry.id} className="flex items-start gap-3">
                  <div
                    className="flex-1 min-w-0 flex items-start gap-3 cursor-pointer"
                    onClick={() => router.push(`/app/accounts/${entry.account_id}`)}
                  >
                    <div className="w-10 h-10 bg-[#1E2761]/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5 text-[#1E2761]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#1E293B] truncate">{acc.name}</p>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${acc.status === 'prospect' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                          {acc.status === 'prospect' ? 'Prospect' : 'Client'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {acc.city && <span className="flex items-center gap-1 text-xs text-[#64748B]"><MapPin className="w-3 h-3" />{acc.city}</span>}
                        {acc.industry && <span className="text-xs text-[#64748B]">{acc.industry}</span>}
                        <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                          <VisIcon className="w-3 h-3" />{VISIBILITY_LABEL[vis]}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </div>
                  <button
                    onClick={() => handleRemove(entry.id)}
                    title="Retirer du portefeuille"
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setCreateError('') }} title="Nouvelle entreprise">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input id="name" label="Raison sociale" placeholder="Entreprise Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <Input id="city" label="Ville (optionnel)" placeholder="Lyon" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          <Input id="industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Statut</label>
            <div className="flex rounded-xl bg-gray-100 p-1">
              <button type="button" onClick={() => setNewStatus('client')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${newStatus === 'client' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'}`}>Client</button>
              <button type="button" onClick={() => setNewStatus('prospect')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${newStatus === 'prospect' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'}`}>Prospect</button>
            </div>
          </div>
          {createError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{createError}</p>}
          <p className="text-xs text-[#94A3B8]">L'entreprise sera ajoutée à votre portefeuille et visible par toute l'équipe par défaut.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setCreateOpen(false); setCreateError('') }} className="flex-1">Annuler</Button>
            <Button type="submit" loading={creating} className="flex-1">Créer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

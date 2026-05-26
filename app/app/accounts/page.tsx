'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, ChevronRight, MapPin, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Account } from '@/types/database'

export default function AccountsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newIndustry, setNewIndustry] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchAccounts = async () => {
    const supabase = createClient()
    let q = supabase.from('accounts').select('*').order('created_at', { ascending: false })
    if (profile?.company_id) q = q.eq('company_id', profile.company_id)
    const { data } = await q
    setAccounts(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!profileLoading) fetchAccounts()
  }, [profileLoading, profile])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    if (!newName.trim()) return
    if (!profile) { setCreateError('Session expirée.'); return }
    setCreating(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('accounts')
      .insert({ name: newName.trim(), city: newCity.trim() || null, industry: newIndustry.trim() || null, company_id: profile.company_id })
      .select().single()

    if (error) { setCreateError(error.message) }
    else if (data) {
      setAccounts((prev) => [data, ...prev])
      setModalOpen(false); setNewName(''); setNewCity(''); setNewIndustry('')
    }
    setCreating(false)
  }

  const filtered = accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <Header title="Entreprises" />
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Entreprises</h1>
          <Button onClick={() => setModalOpen(true)} size="sm" className="ml-auto">
            <Plus className="w-4 h-4 mr-1.5" />Nouvelle entreprise
          </Button>
        </div>

        <div className="mb-4">
          <Input placeholder="Rechercher une entreprise..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#64748B]">{search ? 'Aucune entreprise trouvée' : 'Aucune entreprise. Créez la première !'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((account) => (
              <Card key={account.id} onClick={() => router.push(`/app/accounts/${account.id}`)} className="flex items-center gap-4">
                <div className="w-11 h-11 bg-[#1E2761]/10 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-[#1E2761]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1E293B] truncate">{account.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {account.city && (
                      <span className="flex items-center gap-1 text-xs text-[#64748B]">
                        <MapPin className="w-3 h-3" />{account.city}
                      </span>
                    )}
                    {account.industry && (
                      <span className="flex items-center gap-1 text-xs text-[#64748B]">
                        <Briefcase className="w-3 h-3" />{account.industry}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setCreateError('') }} title="Nouvelle entreprise">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input id="name" label="Raison sociale" placeholder="Entreprise Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <Input id="city" label="Ville (optionnel)" placeholder="Lyon" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          <Input id="industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} />
          {createError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{createError}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setCreateError('') }} className="flex-1">Annuler</Button>
            <Button type="submit" loading={creating} className="flex-1">Créer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

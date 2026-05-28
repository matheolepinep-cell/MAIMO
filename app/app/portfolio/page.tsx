'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, Building2, ChevronRight, Lock, Trash2, MapPin, Briefcase as BriefcaseIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

type AccountRow = { id: string; name: string; city: string | null; industry: string | null; status: 'client' | 'prospect' }

type PortfolioEntry = {
  id: string
  account_id: string
  is_private: boolean
  created_at: string
  accounts: AccountRow | null
}

function fmtDate(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
}

export default function PortfolioPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [entries, setEntries] = useState<PortfolioEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [allAccounts, setAllAccounts] = useState<AccountRow[]>([])
  const [addSearch, setAddSearch] = useState('')
  const [addPrivate, setAddPrivate] = useState(false)
  const [selectedAdd, setSelectedAdd] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const fetchEntries = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()
    const { data } = await supabase
      .from('portfolio')
      .select('id, account_id, is_private, created_at, accounts(id, name, city, industry, status)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setEntries((data as unknown as PortfolioEntry[]) ?? [])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    if (!profileLoading) fetchEntries()
  }, [profileLoading, fetchEntries])

  const openAddModal = async () => {
    if (!profile?.company_id) return
    const supabase = createClient()
    const { data } = await supabase
      .from('accounts')
      .select('id, name, city, industry, status')
      .eq('company_id', profile.company_id)
      .order('name')
    const existingIds = new Set(entries.map((e) => e.account_id))
    setAllAccounts((data ?? []).filter((a) => !existingIds.has(a.id)) as AccountRow[])
    setAddSearch('')
    setAddPrivate(false)
    setSelectedAdd(null)
    setAddOpen(true)
  }

  const handleAdd = async () => {
    if (!selectedAdd || !profile) return
    setAdding(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('portfolio')
      .insert({ user_id: profile.id, account_id: selectedAdd, company_id: profile.company_id, is_private: addPrivate })
      .select('id, account_id, is_private, created_at, accounts(id, name, city, industry, status)')
      .single()
    if (!error && data) {
      setEntries((prev) => [data as unknown as PortfolioEntry, ...prev])
      setAddOpen(false)
    }
    setAdding(false)
  }

  const handleRemove = async (entryId: string) => {
    const supabase = createClient()
    await supabase.from('portfolio').delete().eq('id', entryId)
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  const handleTogglePrivate = async (entryId: string, current: boolean) => {
    const supabase = createClient()
    await supabase.from('portfolio').update({ is_private: !current }).eq('id', entryId)
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, is_private: !current } : e))
  }

  const clientCount = entries.filter((e) => e.accounts?.status === 'client').length
  const prospectCount = entries.filter((e) => e.accounts?.status === 'prospect').length

  const filteredAdd = allAccounts.filter((a) =>
    a.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  return (
    <div>
      <Header title="Mon portefeuille" />
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Mon portefeuille</h1>
          <Button onClick={openAddModal} size="sm" className="ml-auto">
            <Plus className="w-4 h-4 mr-1.5" />Ajouter
          </Button>
        </div>

        {!loading && (
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm text-[#64748B]">
              <span className="font-semibold text-[#1E293B]">{entries.length}</span> entreprise{entries.length !== 1 ? 's' : ''}
            </span>
            {clientCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                {clientCount} client{clientCount !== 1 ? 's' : ''}
              </span>
            )}
            {prospectCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                {prospectCount} prospect{prospectCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#64748B] mb-4">Votre portefeuille est vide.</p>
            <Button onClick={openAddModal} variant="secondary" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />Ajouter une entreprise
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const acc = entry.accounts
              if (!acc) return null
              return (
                <Card key={entry.id} className="flex items-start gap-4">
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
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                          acc.status === 'prospect' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                        }`}>
                          {acc.status === 'prospect' ? 'Prospect' : 'Client'}
                        </span>
                        {entry.is_private && (
                          <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <Lock className="w-2.5 h-2.5" />Privé
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {acc.city && (
                          <span className="flex items-center gap-1 text-xs text-[#64748B]">
                            <MapPin className="w-3 h-3" />{acc.city}
                          </span>
                        )}
                        {acc.industry && (
                          <span className="flex items-center gap-1 text-xs text-[#64748B]">
                            <BriefcaseIcon className="w-3 h-3" />{acc.industry}
                          </span>
                        )}
                        <span className="text-xs text-[#94A3B8]">Ajouté le {fmtDate(entry.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => handleTogglePrivate(entry.id, entry.is_private)}
                      title={entry.is_private ? 'Rendre visible par l\'équipe' : 'Rendre privé'}
                      className={`p-1.5 rounded-lg text-xs transition-all duration-150 ${
                        entry.is_private
                          ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(entry.id)}
                      title="Retirer du portefeuille"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter au portefeuille">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Rechercher une entreprise..."
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
          />

          <div className="max-h-56 overflow-y-auto space-y-1">
            {filteredAdd.length === 0 ? (
              <p className="text-sm text-[#64748B] text-center py-4">
                {allAccounts.length === 0 ? 'Toutes les entreprises sont déjà dans votre portefeuille.' : 'Aucune entreprise trouvée.'}
              </p>
            ) : filteredAdd.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedAdd(acc.id === selectedAdd ? null : acc.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                  selectedAdd === acc.id
                    ? 'bg-[#1E2761]/10 border border-[#1E2761]/20'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="w-8 h-8 bg-[#1E2761]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[#1E2761]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1E293B] truncate">{acc.name}</p>
                  {acc.city && <p className="text-xs text-[#64748B]">{acc.city}</p>}
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                  acc.status === 'prospect' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                }`}>
                  {acc.status === 'prospect' ? 'Prospect' : 'Client'}
                </span>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 cursor-pointer py-2 border-t border-gray-100">
            <input
              type="checkbox"
              checked={addPrivate}
              onChange={(e) => setAddPrivate(e.target.checked)}
              className="w-4 h-4 rounded accent-[#1E2761]"
            />
            <div>
              <p className="text-sm font-medium text-[#1E293B]">Rendre privé</p>
              <p className="text-xs text-[#64748B]">Seul vous verrez ce lien dans l'équipe</p>
            </div>
          </label>

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setAddOpen(false)} className="flex-1">Annuler</Button>
            <Button onClick={handleAdd} loading={adding} disabled={!selectedAdd} className="flex-1">
              Ajouter
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

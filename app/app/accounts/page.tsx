'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, ChevronRight, MapPin, Briefcase, Trash2 } from 'lucide-react'
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'client' | 'prospect'>('all')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const handleDelete = async (accountId: string) => {
    setDeleting(true)
    const supabase = createClient()

    const [{ data: docs }, { data: notes }] = await Promise.all([
      supabase.from('documents').select('id, file_url').eq('account_id', accountId),
      supabase.from('notes').select('id').eq('account_id', accountId),
    ])

    const docIds = (docs ?? []).map((d) => d.id)
    const fileUrls = (docs ?? []).map((d) => d.file_url).filter(Boolean)
    const noteIds = (notes ?? []).map((n) => n.id)
    const sourceIds = [...docIds, ...noteIds]

    if (fileUrls.length > 0) await supabase.storage.from('documents').remove(fileUrls)
    if (sourceIds.length > 0) await supabase.from('chunks').delete().in('source_id', sourceIds)
    if (docIds.length > 0) await supabase.from('documents').delete().eq('account_id', accountId)
    await supabase.from('notes').delete().eq('account_id', accountId)
    await supabase.from('contacts').delete().eq('account_id', accountId)
    await supabase.from('accounts').delete().eq('id', accountId)

    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setDeleteConfirmId(null)
    setDeleting(false)
  }

  const filtered = accounts
    .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)

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

        <div className="flex gap-2 mb-3">
          {(['all', 'client', 'prospect'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                statusFilter === f ? 'bg-[#1E2761] text-white' : 'bg-white border border-gray-200 text-[#64748B] hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'client' ? 'Clients' : 'Prospects'}
            </button>
          ))}
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
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#1E293B] truncate">{account.name}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                      account.status === 'prospect' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {account.status === 'prospect' ? 'Prospect' : 'Client'}
                    </span>
                  </div>
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
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(account.id) }}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Supprimer l'entreprise"
      >
        <p className="text-sm text-[#64748B] mb-4">
          Supprimer <span className="font-semibold text-[#1E293B]">{accounts.find((a) => a.id === deleteConfirmId)?.name}</span> ?
          Cette action supprimera aussi toutes les notes, documents et contacts associés.
          Cette action est irréversible.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)} className="flex-1">Annuler</Button>
          <Button
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            loading={deleting}
            className="flex-1 bg-red-500 hover:bg-red-600 border-red-500"
          >
            Supprimer
          </Button>
        </div>
      </Modal>

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

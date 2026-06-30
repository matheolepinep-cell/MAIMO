'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, ChevronRight, FileText } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Account } from '@/types/database'

function formatDate(date: string | null) {
  if (!date) return 'Aucune note'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

export default function ClientsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [clients, setClients] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [search, setSearch] = useState('')

  const fetchClients = async () => {
    const supabase = createClient()
    let query = supabase.from('clients').select('*')

    if (profile?.company_id) {
      query = query.eq('company_id', profile.company_id)
    }

    const { data } = await query.order('created_at', { ascending: false })
    setClients(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!profileLoading) fetchClients()
  }, [profileLoading, profile])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    if (!newName.trim()) return
    if (!profile) {
      setCreateError('Session expirée. Veuillez vous reconnecter.')
      return
    }
    setCreating(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('clients')
      .insert({ name: newName.trim(), description: newDesc.trim() || null, company_id: profile.company_id })
      .select()
      .single()

    if (error) {
      setCreateError(error.message)
    } else if (data) {
      setClients((prev) => [data, ...prev])
      setModalOpen(false)
      setNewName('')
      setNewDesc('')
    }
    setCreating(false)
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Header title="Clients" />
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden lg:block">Clients</h1>
          <Button onClick={() => setModalOpen(true)} size="sm" className="ml-auto">
            <Plus className="w-4 h-4 mr-1.5" />
            Nouveau client
          </Button>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#64748B]">
              {search ? 'Aucun client trouvé' : 'Aucun client encore. Créez le premier !'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((client) => (
              <Card
                key={client.id}
                onClick={() => router.push(`/app/clients/${client.id}`)}
                className="flex items-center gap-4"
              >
                <div className="w-11 h-11 bg-[#0A0A0A]/10 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-[#0A0A0A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1E293B] truncate">{client.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-[#64748B]">
                      Dernière note : {formatDate(client.last_note_at)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setCreateError('') }} title="Nouveau client">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="clientName"
            label="Nom du client"
            placeholder="Entreprise Dupont"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Input
            id="clientDesc"
            label="Description (optionnel)"
            placeholder="Charpentier, Lyon..."
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          {createError && <FormMessage type="error" message={createError} />}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setCreateError('') }} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" loading={creating} className="flex-1">
              Créer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

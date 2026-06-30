'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Trash2, ToggleLeft, ToggleRight, Users, Lock } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { UserProfile, Account, Permission } from '@/types/database'

export default function AdminPage() {
  const router = useRouter()
  const { profile, loading } = useUser()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [clients, setClients] = useState<Pick<Account, 'id' | 'name'>[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [tab, setTab] = useState<'users' | 'permissions'>('users')
  const [modalOpen, setModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'commercial' | 'admin'>('commercial')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && profile?.role !== 'admin') {
      router.replace('/app/clients')
    }
  }, [profile, loading, router])

  useEffect(() => {
    if (profile?.role !== 'admin') return

    Promise.all([
      fetch('/api/admin/users').then((r) => r.json()),
      fetch('/api/admin/permissions').then((r) => r.json()),
    ]).then(([usersData, permsData]) => {
      setUsers(Array.isArray(usersData) ? usersData : [])
      setPermissions(Array.isArray(permsData) ? permsData : [])
    })

    // Fetch clients for permission table
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase
        .from('clients')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .order('name')
        .then(({ data }) => setClients(data ?? []))
    })
  }, [profile])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!newName.trim() || !newEmail.trim()) { setError('Veuillez remplir le nom et l\'email.'); return }
    setCreating(true)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, full_name: newName, role: newRole }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Erreur inconnue')
      setCreating(false)
      return
    }

    setUsers((prev) => [...prev, data])
    setModalOpen(false)
    setNewEmail('')
    setNewName('')
    setNewRole('commercial')
    setCreating(false)
  }

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    })
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: !isActive } : u))
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Supprimer définitivement cet utilisateur ?')) return
    await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    setUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  const handlePermissionToggle = async (userId: string, clientId: string, current: boolean) => {
    await fetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, client_id: clientId, can_read: !current }),
    })
    setPermissions((prev) => {
      const existing = prev.find((p) => p.user_id === userId && p.client_id === clientId)
      if (existing) {
        return prev.map((p) =>
          p.user_id === userId && p.client_id === clientId ? { ...p, can_read: !current } : p
        )
      }
      return [...prev, { id: '', user_id: userId, client_id: clientId, company_id: profile!.company_id, can_read: !current, created_at: '' }]
    })
  }

  const getPermission = (userId: string, clientId: string) => {
    const p = permissions.find((p) => p.user_id === userId && p.client_id === clientId)
    return p?.can_read ?? false
  }

  const commercials = users.filter((u) => u.id !== profile?.id)

  if (loading || profile?.role !== 'admin') return null

  return (
    <div>
      <Header title="Admin" />
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-[#1E293B] mb-6 hidden lg:block">Dashboard Admin</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
              tab === 'users' ? 'bg-[#0A0A0A] text-white' : 'bg-white text-[#64748B] border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Utilisateurs
          </button>
          <button
            onClick={() => setTab('permissions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
              tab === 'permissions' ? 'bg-[#0A0A0A] text-white' : 'bg-white text-[#64748B] border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Lock className="w-4 h-4" />
            Permissions
          </button>
        </div>

        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" />
                Ajouter un collaborateur
              </Button>
            </div>

            {users.map((u) => (
              <Card key={u.id} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#0A0A0A]/10 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-[#0A0A0A] font-bold text-sm">
                    {u.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#1E293B] truncate">{u.full_name}</p>
                  <p className="text-xs text-[#64748B] truncate">{u.email}</p>
                  <span className="text-xs text-[#94A3B8]">{u.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(u.id, u.is_active)}
                    className="text-[#64748B] hover:text-[#1E293B] transition-colors"
                    title={u.is_active ? 'Désactiver' : 'Activer'}
                  >
                    {u.is_active
                      ? <ToggleRight className="w-6 h-6 text-[#10B981]" />
                      : <ToggleLeft className="w-6 h-6 text-gray-300" />
                    }
                  </button>
                  {u.id !== profile?.id && (
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === 'permissions' && (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wide min-w-[140px]">
                        Collaborateur
                      </th>
                      {clients.map((c) => (
                        <th key={c.id} className="px-3 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {commercials.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[#1E293B]">{u.full_name}</p>
                        </td>
                        {clients.map((c) => {
                          const allowed = getPermission(u.id, c.id)
                          return (
                            <td key={c.id} className="px-3 py-3 text-center">
                              <button
                                onClick={() => handlePermissionToggle(u.id, c.id, allowed)}
                                className="transition-all duration-150"
                              >
                                {allowed
                                  ? <ToggleRight className="w-6 h-6 text-[#10B981]" />
                                  : <ToggleLeft className="w-6 h-6 text-gray-200" />
                                }
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {commercials.length === 0 && (
                  <p className="text-center py-8 text-sm text-[#64748B]">Aucun collaborateur à configurer.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Ajouter un collaborateur">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            id="userName"
            label="Nom complet"
            placeholder="Jean Dupont"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Input
            id="userEmail"
            type="email"
            label="Email"
            placeholder="jean@exemple.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onInvalid={(e) => e.preventDefault()}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[#1E293B]">Rôle</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'commercial' | 'admin')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            >
              <option value="commercial">Collaborateur</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <FormMessage type="error" message={error} />}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} className="flex-1">
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

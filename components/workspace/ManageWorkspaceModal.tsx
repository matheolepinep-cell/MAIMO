'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Workspace } from '@/types/database'

const PRESET_COLORS = [
  '1E2761', '3B5BDB', '7950F2', '2F9E44',
  'E67700', 'C92A2A', '1098AD', '862E9C',
]

type Member = { id: string; full_name: string; email: string; role: 'admin' | 'member' }
type CompanyMember = { id: string; full_name: string; email: string }

type Props = {
  workspace: Workspace
  onClose: () => void
  onDeleted: () => void
}

export function ManageWorkspaceModal({ workspace, onClose, onDeleted }: Props) {
  const { profile } = useUser()
  const { refreshWorkspaces, currentWorkspace, setCurrentWorkspace, userWorkspaces } = useWorkspace()
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [color, setColor] = useState(workspace.color)
  const [members, setMembers] = useState<Member[]>([])
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([])
  const [addMemberId, setAddMemberId] = useState('')
  const [addMemberRole, setAddMemberRole] = useState<'admin' | 'member'>('member')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!profile) return
    const supabase = createClient()
    supabase
      .from('workspace_members')
      .select('user_id, role, users(id, full_name, email)')
      .eq('workspace_id', workspace.id)
      .then(({ data }) => {
        type Row = { user_id: string; role: string; users: { id: string; full_name: string; email: string } | null }
        setMembers(
          ((data ?? []) as unknown as Row[])
            .filter((r) => r.users)
            .map((r) => ({ id: r.users!.id, full_name: r.users!.full_name, email: r.users!.email, role: r.role as 'admin' | 'member' }))
        )
      })
    supabase
      .from('users')
      .select('id, full_name, email')
      .eq('company_id', profile.company_id)
      .then(({ data }) => setCompanyMembers((data ?? []) as CompanyMember[]))
  }, [workspace.id, profile])

  const nonMembers = companyMembers.filter((cm) => !members.find((m) => m.id === cm.id))

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setMsg('')
    const supabase = createClient()
    const { error } = await supabase
      .from('workspaces')
      .update({ name: name.trim(), description: description.trim() || null, color })
      .eq('id', workspace.id)
    if (error) { setMsg(error.message); setSaving(false); return }
    await refreshWorkspaces()
    setMsg('Enregistré !')
    setSaving(false)
  }

  const handleRoleChange = async (userId: string, role: 'admin' | 'member') => {
    const supabase = createClient()
    await supabase.from('workspace_members').update({ role }).eq('workspace_id', workspace.id).eq('user_id', userId)
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role } : m))
  }

  const handleRemoveMember = async (userId: string) => {
    if (userId === profile?.id) return
    const supabase = createClient()
    await supabase.from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', userId)
    setMembers((prev) => prev.filter((m) => m.id !== userId))
  }

  const handleAddMember = async () => {
    if (!addMemberId) return
    const supabase = createClient()
    await supabase.from('workspace_members').insert({ workspace_id: workspace.id, user_id: addMemberId, role: addMemberRole })
    const cm = companyMembers.find((m) => m.id === addMemberId)
    if (cm) setMembers((prev) => [...prev, { ...cm, role: addMemberRole }])
    setAddMemberId('')
    setAddMemberRole('member')
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('workspace_members').delete().eq('workspace_id', workspace.id)
    await supabase.from('workspaces').delete().eq('id', workspace.id)
    await refreshWorkspaces()
    if (currentWorkspace?.id === workspace.id) {
      const next = userWorkspaces.find((w) => w.id !== workspace.id)
      if (next) setCurrentWorkspace(next)
    }
    setDeleting(false)
    onDeleted()
    onClose()
  }

  const canDelete = !workspace.is_default && userWorkspaces.length > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-[#0F172A]">Gérer l'espace</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Edit name + color */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Nom</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={workspace.is_default}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optionnel"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Couleur</label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      background: `#${c}`,
                      borderColor: color === c ? '#0F172A' : 'transparent',
                      boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px #${c}` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
            {msg && (
              <p className={`text-sm px-3 py-2 rounded-lg ${msg.includes('!') ? 'text-green-700 bg-green-50' : 'text-red-500 bg-red-50'}`}>{msg}</p>
            )}
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: `#${color}` }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>

          <div style={{ height: 1, background: '#E2E8F0' }} />

          {/* Members */}
          <div>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Membres</p>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1E293B] truncate">{m.full_name}</p>
                    <p className="text-xs text-[#94A3B8] truncate">{m.email}</p>
                  </div>
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value as 'admin' | 'member')}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white shrink-0"
                    disabled={m.id === profile?.id}
                  >
                    <option value="member">Membre</option>
                    <option value="admin">Admin</option>
                  </select>
                  {m.id !== profile?.id && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add member */}
            {nonMembers.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <select
                  value={addMemberId}
                  onChange={(e) => setAddMemberId(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white"
                >
                  <option value="">Ajouter un membre...</option>
                  {nonMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <select
                  value={addMemberRole}
                  onChange={(e) => setAddMemberRole(e.target.value as 'admin' | 'member')}
                  className="text-xs border border-gray-200 rounded-xl px-2 py-2 focus:outline-none bg-white shrink-0"
                >
                  <option value="member">Membre</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!addMemberId}
                  className="p-2 rounded-xl text-blue-500 hover:bg-blue-50 transition-all disabled:opacity-40 shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Delete */}
          {canDelete && (
            <>
              <div style={{ height: 1, background: '#E2E8F0' }} />
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-red-500 flex-1">Supprimer définitivement ?</p>
                    <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#64748B] hover:text-[#1E293B]">Annuler</button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-60"
                    >
                      {deleting ? 'Suppression...' : 'Confirmer'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer l'espace
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

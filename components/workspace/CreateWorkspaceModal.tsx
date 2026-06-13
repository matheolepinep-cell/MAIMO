'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Workspace } from '@/types/database'

const PRESET_COLORS = [
  '1E2761', '3B5BDB', '7950F2', '2F9E44',
  'E67700', 'C92A2A', '1098AD', '862E9C',
]

type Member = { id: string; full_name: string; email: string }

type Props = {
  open: boolean
  onClose: () => void
}

export function CreateWorkspaceModal({ open, onClose }: Props) {
  const { profile } = useUser()
  const { refreshWorkspaces, setCurrentWorkspace } = useWorkspace()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('3B5BDB')
  const [selectedMembers, setSelectedMembers] = useState<{ member: Member; role: 'admin' | 'member' }[]>([])
  const [companyMembers, setCompanyMembers] = useState<Member[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadMembers = async () => {
    if (membersLoaded || !profile) return
    const supabase = createClient()
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('company_id', profile.company_id)
      .neq('id', profile.id)
      .eq('is_active', true)
    setCompanyMembers((data ?? []) as Member[])
    setMembersLoaded(true)
  }

  const toggleMember = (member: Member) => {
    setSelectedMembers((prev) => {
      if (prev.find((m) => m.member.id === member.id)) return prev.filter((m) => m.member.id !== member.id)
      return [...prev, { member, role: 'member' }]
    })
  }

  const setMemberRole = (memberId: string, role: 'admin' | 'member') => {
    setSelectedMembers((prev) => prev.map((m) => m.member.id === memberId ? { ...m, role } : m))
  }

  const handleCreate = async () => {
    if (!name.trim() || !profile) return
    setSaving(true)
    setError('')
    const supabase = createClient()

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({
        company_id: profile.company_id,
        name: name.trim(),
        description: description.trim() || null,
        color,
        created_by: profile.id,
        is_default: false,
      })
      .select()
      .single()

    if (wsErr || !ws) { setError(wsErr?.message ?? 'Erreur lors de la création'); setSaving(false); return }

    await supabase.from('workspace_members').insert({ workspace_id: ws.id, user_id: profile.id, role: 'admin' })

    if (selectedMembers.length > 0) {
      await supabase.from('workspace_members').insert(
        selectedMembers.map((m) => ({ workspace_id: ws.id, user_id: m.member.id, role: m.role }))
      )
    }

    await refreshWorkspaces()
    setCurrentWorkspace(ws as Workspace)
    handleClose()
    setSaving(false)
  }

  const handleClose = () => {
    setName(''); setDescription(''); setColor('3B5BDB'); setSelectedMembers([]); setMembersLoaded(false); setError('')
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-[#0F172A]">Créer un espace</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Nom de l'espace *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Équipe Paris, Q1 2026..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
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
                  className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    background: `#${c}`,
                    borderColor: color === c ? '#0F172A' : 'transparent',
                    boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px #${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Membres</label>
            {!membersLoaded ? (
              <button onClick={loadMembers} className="text-xs text-blue-500 hover:text-blue-700 transition-colors">
                Charger les membres de l'organisation →
              </button>
            ) : companyMembers.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">Aucun autre membre dans l'organisation</p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {companyMembers.map((m) => {
                  const sel = selectedMembers.find((x) => x.member.id === m.id)
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => toggleMember(m)}>
                      <input type="checkbox" checked={!!sel} onChange={() => {}} className="w-4 h-4 accent-blue-500 shrink-0 cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1E293B] truncate">{m.full_name}</p>
                        <p className="text-xs text-[#94A3B8] truncate">{m.email}</p>
                      </div>
                      {sel && (
                        <select
                          value={sel.role}
                          onChange={(e) => { e.stopPropagation(); setMemberRole(m.id, e.target.value as 'admin' | 'member') }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white shrink-0"
                        >
                          <option value="member">Membre</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && <FormMessage type="error" message={error} />}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
          <button onClick={handleClose} className="px-4 py-2 rounded-xl text-sm text-[#64748B] hover:bg-gray-100 transition-all">
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: `#${color}` }}
          >
            {saving ? 'Création...' : 'Créer l\'espace'}
          </button>
        </div>
      </div>
    </div>
  )
}

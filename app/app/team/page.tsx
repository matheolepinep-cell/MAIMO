'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Users, UserPlus, Mail, Briefcase, Building2, Lock, ChevronDown, Check, X, Link2, Copy, Trash2 } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useIsWorkspaceAdmin } from '@/hooks/useRole'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { UserProfile, WorkspaceRole } from '@/types/database'

type WsMember = {
  user: UserProfile
  wsRole: WorkspaceRole
  wsIsActive: boolean
}

type PublicEntry = {
  id: string
  account_id: string
  accounts: { name: string; city: string | null; status: 'client' | 'prospect' } | null
}

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; bg: string; color: string }> = {
  admin: { label: 'Admin', bg: '#DBEAFE', color: '#2563EB' },
  member: { label: 'Membre', bg: '#DCFCE7', color: '#16A34A' },
  contributeur: { label: 'Contributeur', bg: '#FEF9C3', color: '#CA8A04' },
}

function RoleBadge({
  role,
  editable,
  onSelect,
}: {
  role: WorkspaceRole
  editable: boolean
  onSelect?: (r: WorkspaceRole) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cfg = ROLE_CONFIG[role]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!editable) {
    return (
      <span
        className="text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        {cfg.label}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        {cfg.label}
        <ChevronDown style={{ width: 10, height: 10 }} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl py-1 z-50 min-w-[140px]"
          style={{ background: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {(Object.entries(ROLE_CONFIG) as [WorkspaceRole, typeof cfg][]).map(([r, c]) => (
            <button
              key={r}
              onClick={() => { onSelect?.(r); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-gray-50"
              style={{ color: '#1E293B' }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
              {c.label}
              {r === role && <Check style={{ width: 12, height: 12, marginLeft: 'auto', color: '#2563EB' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeamPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { currentWorkspace, userWorkspaces, wsId } = useWorkspace()
  const isAdmin = useIsWorkspaceAdmin()

  const [members, setMembers] = useState<WsMember[]>([])
  const [portfolioCounts, setPortfolioCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState(false)

  // Invite modal
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteWsRole, setInviteWsRole] = useState<WorkspaceRole>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Portfolio viewer
  const [viewingMember, setViewingMember] = useState<UserProfile | null>(null)
  const [memberPortfolio, setMemberPortfolio] = useState<PublicEntry[]>([])
  const [portfolioLoading, setPortfolioLoading] = useState(false)

  // Disable confirmation
  const [disableTarget, setDisableTarget] = useState<WsMember | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<WsMember | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Invite links
  const [inviteLinks, setInviteLinks] = useState<{ token: string; link: string; role: WorkspaceRole; expires_at: string }[]>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [showLinks, setShowLinks] = useState(false)

  const showToast = (msg: string, error = false) => {
    setToast(msg)
    setToastError(error)
    setTimeout(() => setToast(''), 3000)
  }

  const fetchMembers = async () => {
    if (!profile?.company_id || !wsId) return
    setLoading(true)
    const supabase = createClient()

    const { data: wmData } = await supabase
      .from('workspace_members')
      .select('user_id, role, is_active')
      .eq('workspace_id', wsId)

    if (!wmData?.length) { setMembers([]); setLoading(false); return }

    const userIds = wmData.map((m) => m.user_id)
    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .in('id', userIds)
      .order('full_name', { ascending: true })

    const { data: portfolioData } = await supabase
      .from('portfolio')
      .select('user_id')
      .eq('company_id', profile.company_id)
      .eq('is_private', false)

    const counts: Record<string, number> = {}
    for (const p of portfolioData ?? []) {
      counts[p.user_id] = (counts[p.user_id] ?? 0) + 1
    }
    setPortfolioCounts(counts)

    const wmMap: Record<string, { role: WorkspaceRole; is_active: boolean }> = {}
    for (const wm of wmData) wmMap[wm.user_id] = { role: wm.role as WorkspaceRole, is_active: wm.is_active ?? true }

    const enriched: WsMember[] = (usersData ?? []).map((u) => ({
      user: u as UserProfile,
      wsRole: wmMap[u.id]?.role ?? 'member',
      wsIsActive: wmMap[u.id]?.is_active ?? true,
    }))

    setMembers(enriched)
    setLoading(false)
  }

  useEffect(() => {
    if (!profileLoading && wsId) fetchMembers()
  }, [profileLoading, profile, wsId])

  const handleRoleChange = async (member: WsMember, newRole: WorkspaceRole) => {
    if (!wsId) return
    const res = await fetch('/api/workspace/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wsId, user_id: member.user.id, role: newRole }),
    })
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => m.user.id === member.user.id ? { ...m, wsRole: newRole } : m)
      )
      showToast(`Rôle mis à jour : ${ROLE_CONFIG[newRole].label}`)
    } else {
      const json = await res.json()
      showToast(json.error ?? 'Erreur lors du changement de rôle.', true)
    }
  }

  const handleToggleActive = async (member: WsMember, activate: boolean) => {
    if (!wsId) return
    const res = await fetch('/api/workspace/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wsId, user_id: member.user.id, is_active: activate }),
    })
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => m.user.id === member.user.id ? { ...m, wsIsActive: activate } : m)
      )
      setDisableTarget(null)
      showToast(activate ? 'Membre réactivé.' : 'Membre désactivé.')
    } else {
      const json = await res.json()
      showToast(json.error ?? 'Erreur.', true)
    }
  }

  const handleDeleteMember = async (member: WsMember) => {
    if (!wsId) return
    setDeleting(true)
    const res = await fetch('/api/workspace/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wsId, user_id: member.user.id }),
    })
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user.id !== member.user.id))
      setDeleteTarget(null)
      setDeleteConfirmText('')
      showToast('Membre supprimé définitivement.')
    } else {
      const json = await res.json()
      showToast(json.error ?? 'Erreur lors de la suppression.', true)
    }
    setDeleting(false)
  }

  const handleViewPortfolio = async (member: UserProfile) => {
    setViewingMember(member)
    setPortfolioLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('portfolio')
      .select('id, account_id, accounts(name, city, status)')
      .eq('user_id', member.id)
      .eq('is_private', false)
      .order('created_at', { ascending: false })
    setMemberPortfolio((data as unknown as PublicEntry[]) ?? [])
    setPortfolioLoading(false)
  }

  const loadInviteLinks = async () => {
    if (!wsId) return
    const res = await fetch(`/api/workspace/invite-link?workspace_id=${wsId}`)
    if (res.ok) {
      const data = await res.json()
      setInviteLinks(data)
    }
  }

  const handleGenerateLink = async (role: WorkspaceRole) => {
    if (!wsId) return
    setLinkLoading(true)
    const res = await fetch('/api/workspace/invite-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wsId, role }),
    })
    if (res.ok) {
      const data = await res.json()
      setInviteLinks((prev) => [data, ...prev])
      showToast('Lien généré avec succès !')
    } else {
      showToast('Erreur lors de la génération du lien.', true)
    }
    setLinkLoading(false)
  }

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => showToast('Lien copié !'))
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError("Veuillez remplir le nom et l'email.")
      return
    }
    if (!wsId) { setInviteError('Aucun espace actif.'); return }
    setInviting(true)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        full_name: inviteName.trim(),
        role: 'commercial',
        workspaces: [{ wsId, role: inviteWsRole }],
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setInviteError(json.error ?? "Erreur lors de l'invitation.")
    } else {
      setInviteSuccess(`Invitation envoyée à ${inviteEmail.trim()} !`)
      setInviteEmail('')
      setInviteName('')
      setInviteWsRole('member')
      fetchMembers()
    }
    setInviting(false)
  }

  return (
    <div>
      <Header title="Équipe" />
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Équipe</h1>
            {currentWorkspace && (
              <p className="text-sm text-[#94A3B8] hidden md:block mt-0.5">{currentWorkspace.name}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 ml-auto">
              <Button
                onClick={() => { setShowLinks((v) => !v); if (!showLinks) loadInviteLinks() }}
                size="sm"
                variant="secondary"
              >
                <Link2 className="w-4 h-4 mr-1.5" />Liens
              </Button>
              <Button onClick={() => { setModalOpen(true); setInviteSuccess(''); setInviteError('') }} size="sm">
                <UserPlus className="w-4 h-4 mr-1.5" />Inviter
              </Button>
            </div>
          )}
        </div>

        {/* Invite links panel */}
        {showLinks && isAdmin && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#1E293B]">Liens d'invitation</p>
              <p className="text-xs text-[#94A3B8]">Valides 7 jours · un usage</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['admin', 'member', 'contributeur'] as WorkspaceRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleGenerateLink(r)}
                  disabled={linkLoading}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: '#E5E7EB', color: ROLE_CONFIG[r].color }}
                >
                  <Link2 style={{ width: 12, height: 12 }} />
                  Générer lien {ROLE_CONFIG[r].label}
                </button>
              ))}
            </div>
            {inviteLinks.length > 0 && (
              <div className="space-y-2">
                {inviteLinks.map((inv) => (
                  <div key={inv.token} className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: ROLE_CONFIG[inv.role].bg, color: ROLE_CONFIG[inv.role].color }}
                    >
                      {ROLE_CONFIG[inv.role].label}
                    </span>
                    <p className="flex-1 text-xs text-[#64748B] truncate font-mono">{inv.link}</p>
                    <button
                      onClick={() => copyLink(inv.link)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-[#64748B]"
                      title="Copier"
                    >
                      <Copy style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#64748B]">Aucun membre dans cet espace.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const pubCount = portfolioCounts[member.user.id] ?? 0
              const isMe = member.user.id === profile?.id
              const inactive = !member.wsIsActive

              return (
                <Card
                  key={member.user.id}
                  className={`flex items-center gap-4 ${inactive ? 'opacity-60' : ''}`}
                  onClick={() => !inactive && handleViewPortfolio(member.user)}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: inactive ? '#F1F5F9' : 'rgba(37,99,235,0.08)' }}
                  >
                    <span className="text-sm font-bold" style={{ color: inactive ? '#94A3B8' : '#2563EB' }}>
                      {member.user.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[#1E293B] truncate">{member.user.full_name}</p>
                      {isMe && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Moi</span>
                      )}
                      {inactive && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactif</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <a
                        href={`mailto:${member.user.email}`}
                        className="flex items-center gap-1 text-xs text-[#64748B] hover:text-[#0A0A0A] transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Mail className="w-3 h-3" />{member.user.email}
                      </a>
                      {pubCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-[#64748B]">
                          <Briefcase className="w-3 h-3" />{pubCount} client{pubCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <RoleBadge
                      role={member.wsRole}
                      editable={isAdmin && !isMe}
                      onSelect={(r) => handleRoleChange(member, r)}
                    />
                    {isAdmin && !isMe && (
                      <>
                        {inactive ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(member, true) }}
                            className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors hover:bg-green-50"
                            style={{ color: '#16A34A', border: '1px solid #BBF7D0' }}
                          >
                            Réactiver
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDisableTarget(member) }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                            title="Désactiver"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(member); setDeleteConfirmText('') }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all"
          style={{ background: toastError ? '#EF4444' : '#1E293B' }}
        >
          {toast}
        </div>
      )}

      {/* Portfolio viewer */}
      <Modal
        open={!!viewingMember}
        onClose={() => { setViewingMember(null); setMemberPortfolio([]) }}
        title={viewingMember ? `Portefeuille de ${viewingMember.full_name.split(' ')[0]}` : ''}
      >
        {portfolioLoading ? (
          <div className="space-y-2 py-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : memberPortfolio.length === 0 ? (
          <div className="text-center py-8">
            <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-[#64748B]">Aucun client public dans ce portefeuille.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {memberPortfolio.map((entry) => {
              const acc = entry.accounts
              if (!acc) return null
              return (
                <button
                  key={entry.id}
                  onClick={() => { setViewingMember(null); router.push(`/app/accounts/${entry.account_id}`) }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-150 text-left"
                >
                  <div className="w-8 h-8 bg-[#EFF6FF] rounded-lg flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-blue-500" />
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
              )
            })}
          </div>
        )}
        <div className="pt-3 border-t border-gray-100 mt-3">
          <p className="text-xs text-[#94A3B8] flex items-center gap-1">
            <Lock className="w-3 h-3" />Les entrées privées ne sont pas affichées.
          </p>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteConfirmText('') } }}
        title="Supprimer définitivement ?"
      >
        <p className="text-sm text-[#64748B] mb-4">
          Supprimer définitivement <strong className="text-[#1E293B]">{deleteTarget?.user.full_name}</strong> ? Toutes ses données (notes, messages) seront conservées mais son accès sera supprimé de façon <strong>irréversible</strong>.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
            Tapez <span className="font-bold text-red-600">SUPPRIMER</span> pour confirmer
          </label>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="SUPPRIMER"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteConfirmText('') }} className="flex-1" disabled={deleting}>Annuler</Button>
          <Button
            onClick={() => deleteTarget && handleDeleteMember(deleteTarget)}
            disabled={deleteConfirmText !== 'SUPPRIMER' || deleting}
            loading={deleting}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            Supprimer
          </Button>
        </div>
      </Modal>

      {/* Disable confirmation */}
      <Modal
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        title="Désactiver ce membre ?"
      >
        <p className="text-sm text-[#64748B] mb-4">
          {disableTarget?.user.full_name} ne pourra plus accéder à cet espace. Ses données sont conservées et vous pouvez le réactiver à tout moment.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDisableTarget(null)} className="flex-1">Annuler</Button>
          <Button
            onClick={() => disableTarget && handleToggleActive(disableTarget, false)}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white border-red-500"
          >
            Désactiver
          </Button>
        </div>
      </Modal>

      {/* Invite modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setInviteError(''); setInviteSuccess('') }}
        title="Inviter un collaborateur"
      >
        {inviteSuccess ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-medium text-[#1E293B] mb-1">Invitation envoyée !</p>
            <p className="text-sm text-[#64748B] mb-4">{inviteSuccess}</p>
            <Button onClick={() => setInviteSuccess('')} variant="secondary" className="w-full">
              Inviter quelqu'un d'autre
            </Button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <Input
              id="inviteName" label="Nom complet" placeholder="Marie Martin"
              value={inviteName} onChange={(e) => setInviteName(e.target.value)} autoFocus
            />
            <Input
              id="inviteEmail" type="email" label="Email" placeholder="marie@exemple.com"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              onInvalid={(e) => e.preventDefault()}
            />
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Rôle dans l'espace</label>
              <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
                {(Object.entries(ROLE_CONFIG) as [WorkspaceRole, typeof ROLE_CONFIG[WorkspaceRole]][]).map(([r, c]) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteWsRole(r)}
                    className="flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-150"
                    style={inviteWsRole === r
                      ? { background: '#fff', color: c.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                      : { color: '#64748B' }
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#94A3B8] mt-1.5">
                {inviteWsRole === 'contributeur'
                  ? 'Accès limité : portefeuille et saisie de notes uniquement.'
                  : inviteWsRole === 'member'
                  ? 'Accès standard : tout sauf la gestion de l\'équipe.'
                  : 'Accès total : gestion de l\'équipe et des paramètres incluse.'}
              </p>
            </div>
            {currentWorkspace && (
              <p className="text-xs text-[#94A3B8] px-1">
                Espace : <span className="font-medium text-[#1E293B]">{currentWorkspace.name}</span>
              </p>
            )}
            {inviteError && <FormMessage type="error" message={inviteError} />}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} className="flex-1">Annuler</Button>
              <Button type="submit" loading={inviting} className="flex-1">Envoyer l'invitation</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

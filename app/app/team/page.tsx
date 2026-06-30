'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users, UserPlus, Mail, Briefcase, Building2, Lock, ChevronDown, Check, X, Link2, Copy, Trash2, Activity, MessageCircle, ChevronRight } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRole } from '@/hooks/useRole'
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

type AuditLog = {
  id: string
  user_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; bg: string; color: string }> = {
  admin: { label: 'Admin', bg: '#DBEAFE', color: '#2563EB' },
  member: { label: 'Membre', bg: '#DCFCE7', color: '#16A34A' },
  contributeur: { label: 'Contributeur', bg: '#FEF9C3', color: '#CA8A04' },
}

const ACTION_LABELS: Record<string, string> = {
  'note.created': 'a créé une note',
  'note.deleted': 'a supprimé une note',
  'note.updated': 'a modifié une note',
  'account.created': 'a créé un client',
  'account.deleted': 'a supprimé un client',
  'account.updated': 'a modifié un client',
  'document.uploaded': 'a importé un document',
  'document.deleted': 'a supprimé un document',
  'search.query': 'a effectué une recherche',
  'member.invited': 'a invité un membre',
  'member.role_changed': 'a modifié un rôle',
  'member.deactivated': 'a désactivé un membre',
  'member.deleted': 'a supprimé un membre',
  'message.deleted': 'a supprimé un message',
  'user.login': "s'est connecté",
}

const ACTION_GROUPS: Record<string, string[]> = {
  Notes: ['note.created', 'note.deleted', 'note.updated'],
  Clients: ['account.created', 'account.deleted', 'account.updated'],
  Recherches: ['search.query'],
  Membres: ['member.invited', 'member.role_changed', 'member.deactivated', 'member.deleted'],
  Documents: ['document.uploaded', 'document.deleted'],
  Messages: ['message.deleted'],
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function getMetaText(log: AuditLog): string | null {
  const m = log.metadata
  if (log.action === 'search.query' && m.query) return `"${String(m.query)}"`
  if (log.action === 'member.role_changed' && m.old_role && m.new_role) return `${m.old_role} → ${m.new_role}`
  if ((log.action === 'account.created' || log.action === 'account.deleted') && m.name) return String(m.name)
  if ((log.action === 'document.uploaded' || log.action === 'document.deleted') && m.file_name) return String(m.file_name)
  return null
}

const DELETED_RESOURCE_ACTIONS = new Set(['note.deleted', 'account.deleted', 'document.deleted', 'member.deleted'])

function getActionLink(log: AuditLog): string | null {
  switch (log.action) {
    case 'note.created':
    case 'note.updated':
      return log.metadata?.account_id ? `/app/accounts/${log.metadata.account_id}?tab=notes` : null
    case 'account.created':
    case 'account.updated':
      return log.resource_id ? `/app/accounts/${log.resource_id}` : null
    case 'document.uploaded':
      return log.metadata?.account_id ? `/app/accounts/${log.metadata.account_id}?tab=documents` : null
    case 'member.invited':
    case 'member.role_changed':
    case 'member.deactivated':
      return '/app/team'
    default:
      return null
  }
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
  const { currentWorkspace, wsId } = useWorkspace()
  const wsRole = useRole()
  const isAdmin = wsRole === 'admin'
  const isMember = wsRole === 'member'
  const canInvite = isAdmin || isMember

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

  // Activité tab
  const [activeTab, setActiveTab] = useState<'membres' | 'activite'>('membres')
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditPage, setAuditPage] = useState(0)
  const [auditHasMore, setAuditHasMore] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

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

  const ACTIVITY_ACTIONS = ['note.created', 'account.created', 'document.uploaded'] as const

  const loadAuditLogs = async (page: number) => {
    if (!wsId) return
    setAuditLoading(true)
    const supabase = createClient()
    const PAGE_SIZE = 50

    const { data, count } = await supabase
      .from('audit_logs')
      .select('id, user_id, action, resource_type, resource_id, metadata, created_at', { count: 'exact' })
      .eq('workspace_id', wsId)
      .in('action', ACTIVITY_ACTIONS)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    setAuditLogs((data as AuditLog[]) ?? [])
    setAuditHasMore((count ?? 0) > (page + 1) * PAGE_SIZE)
    setAuditPage(page)
    setAuditLoading(false)
  }

  useEffect(() => {
    if (!profileLoading && wsId) fetchMembers()
  }, [profileLoading, profile, wsId])

  useEffect(() => {
    if (activeTab === 'activite' && isAdmin && wsId) {
      loadAuditLogs(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin, wsId])

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
      setDisableTarget(null)
      showToast(activate ? 'Membre réactivé.' : 'Membre désactivé.')
      // Refetch to guarantee UI reflects DB state
      await fetchMembers()
    } else {
      const json = await res.json()
      showToast(json.error ?? 'Erreur.', true)
    }
  }

  const handleResendInvite = async (member: WsMember) => {
    const res = await fetch('/api/admin/resend-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: member.user.email, full_name: member.user.full_name }),
    })
    if (res.ok) {
      showToast(`Invitation renvoyée à ${member.user.email}`)
    } else {
      const json = await res.json()
      showToast(json.error ?? "Erreur lors de l'envoi.", true)
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

  const membersMap = Object.fromEntries(members.map((m) => [m.user.id, m.user.full_name]))

  return (
    <div>
      <Header title="Équipe" />
      <div className="p-4 md:p-8 pb-24 md:pb-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1E293B] hidden lg:block">Équipe</h1>
            {currentWorkspace && (
              <p className="text-sm text-[#94A3B8] hidden lg:block mt-0.5">{currentWorkspace.name}</p>
            )}
          </div>
          {canInvite && (
            <div className="flex items-center gap-2 ml-auto">
              {isAdmin && (
                <Button
                  onClick={() => { setShowLinks((v) => !v); if (!showLinks) loadInviteLinks() }}
                  size="sm"
                  variant="secondary"
                >
                  <Link2 className="w-4 h-4 mr-1.5" />Liens
                </Button>
              )}
              <Button onClick={() => {
                setModalOpen(true)
                setInviteSuccess('')
                setInviteError('')
                if (!isAdmin) setInviteWsRole('contributeur')
              }} size="sm">
                <UserPlus className="w-4 h-4 mr-1.5" />Inviter
              </Button>
            </div>
          )}
        </div>

        {/* Tab switcher (admin only) */}
        {isAdmin && (
          <div className="flex gap-1 mb-6 border-b border-gray-100">
            {(['membres', 'activite'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex items-center gap-1.5 pb-3 px-1 mr-4 text-sm font-medium transition-colors relative"
                style={{ color: activeTab === tab ? '#2563EB' : '#64748B' }}
              >
                {tab === 'membres' ? <Users className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
                {tab === 'membres' ? 'Membres' : 'Activité'}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#2563EB' }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── MEMBRES TAB ── */}
        {(activeTab === 'membres' || !isAdmin) && (
          <>
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
                {members
                  // Non-admins only see active members
                  .filter((m) => isAdmin || m.wsIsActive)
                  .map((member) => {
                  const pubCount = portfolioCounts[member.user.id] ?? 0
                  const isMe = member.user.id === profile?.id
                  const inactive = !member.wsIsActive
                  const isPending = inactive && member.user.has_set_password === false

                  return (
                    <Card
                      key={member.user.id}
                      className={inactive ? 'opacity-60' : ''}
                      onClick={() => !inactive && handleViewPortfolio(member.user)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: inactive ? '#F1F5F9' : '#EFF6FF' }}
                        >
                          <span className="text-sm font-bold" style={{ color: inactive ? '#94A3B8' : '#2563EB' }}>
                            {member.user.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Content column */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Name + role badge + status tags */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <p className="font-semibold text-[#1E293B]">{member.user.full_name}</p>
                            {isMe && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Moi</span>
                            )}
                            {isPending && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400" style={{ border: '1px solid #E5E7EB' }}>En attente</span>
                            )}
                            {inactive && !isPending && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactif</span>
                            )}
                            <span onClick={(e) => e.stopPropagation()}>
                              <RoleBadge
                                role={member.wsRole}
                                editable={isAdmin && !isMe}
                                onSelect={(r) => handleRoleChange(member, r)}
                              />
                            </span>
                          </div>

                          {/* Row 2: Email + portfolio count */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {isAdmin && (
                              <a
                                href={`mailto:${member.user.email}`}
                                className="flex items-center gap-1 text-xs text-[#64748B] hover:text-[#0A0A0A] transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Mail className="w-3 h-3" />{member.user.email}
                              </a>
                            )}
                            {pubCount > 0 && (
                              <span className="flex items-center gap-1 text-xs text-[#64748B]">
                                <Briefcase className="w-3 h-3" />{pubCount} client{pubCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {/* Row 3: Action buttons */}
                          {!isMe && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              {isAdmin ? (
                                <>
                                  {isPending ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleResendInvite(member) }}
                                      className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors hover:bg-blue-50"
                                      style={{ color: '#2563EB', border: '1px solid #BFDBFE' }}
                                    >
                                      Renvoyer
                                    </button>
                                  ) : inactive ? (
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
                                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors hover:bg-orange-50"
                                      style={{ color: '#F97316', border: '1px solid #FED7AA' }}
                                    >
                                      <X className="w-3 h-3" />Désactiver
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(member); setDeleteConfirmText('') }}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors hover:bg-red-50"
                                    style={{ color: '#EF4444', border: '1px solid #FECACA' }}
                                  >
                                    <Trash2 className="w-3 h-3" />Supprimer
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleViewPortfolio(member.user) }}
                                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors hover:bg-blue-50"
                                    style={{ color: '#2563EB', border: '1px solid #BFDBFE' }}
                                  >
                                    <Briefcase className="w-3 h-3" />Portfolio
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); router.push(`/app/messages?userId=${member.user.id}`) }}
                                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors hover:bg-gray-50"
                                    style={{ color: '#374151', border: '1px solid #E5E7EB' }}
                                  >
                                    <MessageCircle className="w-3 h-3" />Message
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── ACTIVITÉ TAB ── */}
        {activeTab === 'activite' && isAdmin && (() => {
          const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
          const recent = auditLogs.filter((l) => new Date(l.created_at) > cutoff)
          const archived = auditLogs.filter((l) => new Date(l.created_at) <= cutoff)

          const renderLog = (log: AuditLog) => {
            const userName = log.user_id ? (membersMap[log.user_id] ?? 'Utilisateur') : 'Système'
            const initial = userName.charAt(0).toUpperCase()
            const link = getActionLink(log)
            const actionLabel: Record<string, string> = {
              'note.created': 'a ajouté une note',
              'account.created': 'a créé un client',
              'document.uploaded': 'a importé un document',
            }
            const label = actionLabel[log.action] ?? log.action
            const accountName = (log.metadata?.account_name as string | undefined) ?? (log.metadata?.name as string | undefined) ?? null

            const inner = (
              <div className="flex gap-3 py-3" style={{ borderBottom: '1px solid #F9FAFB' }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: '#EFF6FF' }}
                >
                  <span className="text-xs font-bold" style={{ color: '#2563EB' }}>{initial}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug" style={{ color: '#374151' }}>
                    <span className="font-semibold" style={{ color: '#0A0A0A' }}>{userName}</span>
                    {' '}{label}
                    {accountName && (
                      <span style={{ color: '#6B7280' }}> · {accountName}</span>
                    )}
                  </p>
                  {typeof log.metadata?.ai_summary === 'string' && (
                    <p className="text-xs mt-1 leading-snug" style={{ color: '#6B7280', fontStyle: 'italic' }}>
                      &ldquo;{log.metadata.ai_summary as string}&rdquo;
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>{timeAgo(log.created_at)}</p>
                </div>
                {link && (
                  <Link href={link} onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center self-start mt-1" style={{ color: '#9CA3AF' }}>
                    <ChevronRight style={{ width: 14, height: 14 }} />
                  </Link>
                )}
              </div>
            )

            return link
              ? <Link key={log.id} href={link} className="block hover:bg-[#FAFAFA] rounded-lg transition-colors px-1">{inner}</Link>
              : <div key={log.id} className="px-1">{inner}</div>
          }

          return (
            <div>
              {auditLoading ? (
                <div className="space-y-3 mt-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-16">
                  <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-[#64748B] text-sm">Aucune activité enregistrée.</p>
                </div>
              ) : (
                <>
                  {recent.length === 0 && archived.length > 0 && (
                    <p className="text-xs text-[#9CA3AF] mb-3 px-1">Aucune activité récente (48h)</p>
                  )}
                  {recent.map(renderLog)}

                  {archived.length > 0 && (
                    <button
                      onClick={() => setShowArchived((v) => !v)}
                      className="flex items-center justify-center gap-2 w-full mt-3 py-2.5 rounded-xl text-xs font-medium transition-colors hover:bg-gray-100"
                      style={{ background: '#F9FAFB', color: '#6B7280', border: 'none' }}
                    >
                      <Activity style={{ width: 13, height: 13 }} />
                      {showArchived
                        ? 'Masquer les anciennes activités'
                        : `Voir ${archived.length} activité${archived.length > 1 ? 's' : ''} plus ancienne${archived.length > 1 ? 's' : ''}`
                      }
                    </button>
                  )}
                  {showArchived && archived.map(renderLog)}

                  {auditHasMore && (
                    <button
                      onClick={() => loadAuditLogs(auditPage + 1)}
                      className="w-full text-xs text-[#64748B] mt-4 py-2 hover:text-[#0A0A0A] transition-colors"
                    >
                      Charger plus
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })()}
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
            className="w-full px-3 rounded-xl border border-gray-200 text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            style={{ fontSize: 16, minHeight: 48 }}
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
              {isAdmin ? (
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
              ) : (
                <div className="flex rounded-xl bg-gray-100 p-1">
                  <div
                    className="flex-1 py-2 text-xs font-medium rounded-lg text-center"
                    style={{ background: '#fff', color: ROLE_CONFIG.contributeur.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                  >
                    Contributeur
                  </div>
                </div>
              )}
              <p className="text-xs text-[#94A3B8] mt-1.5">
                {inviteWsRole === 'contributeur'
                  ? 'Accès limité : portefeuille et saisie de notes uniquement.'
                  : inviteWsRole === 'member'
                  ? "Accès standard : tout sauf la gestion de l'équipe."
                  : 'Accès total : gestion de l\'équipe et des paramètres incluse.'}
              </p>
              {isMember && (
                <p className="text-xs text-[#6B7280] mt-1">
                  En tant que Membre, vous pouvez uniquement inviter des Contributeurs.
                </p>
              )}
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

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, UserPlus, Mail, Shield, Trash2, Crown, Briefcase, Building2, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { UserProfile } from '@/types/database'

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', commercial: 'Commercial' }

type PublicEntry = {
  id: string
  account_id: string
  accounts: { name: string; city: string | null; status: 'client' | 'prospect' } | null
}

export default function TeamPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [members, setMembers] = useState<UserProfile[]>([])
  const [portfolioCounts, setPortfolioCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'commercial' | 'admin'>('commercial')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Portfolio view modal
  const [viewingMember, setViewingMember] = useState<UserProfile | null>(null)
  const [memberPortfolio, setMemberPortfolio] = useState<PublicEntry[]>([])
  const [portfolioLoading, setPortfolioLoading] = useState(false)

  const fetchMembers = async () => {
    if (!profile?.company_id) return
    const supabase = createClient()
    const [{ data: membersData }, { data: portfolioData }] = await Promise.all([
      supabase.from('users').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: true }),
      supabase.from('portfolio').select('user_id').eq('company_id', profile.company_id).eq('is_private', false),
    ])
    setMembers(membersData ?? [])
    const counts: Record<string, number> = {}
    for (const p of portfolioData ?? []) {
      counts[p.user_id] = (counts[p.user_id] ?? 0) + 1
    }
    setPortfolioCounts(counts)
    setLoading(false)
  }

  useEffect(() => {
    if (!profileLoading) fetchMembers()
  }, [profileLoading, profile])

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    if (!inviteEmail.trim() || !inviteName.trim()) return
    setInviting(true)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole, company_id: profile?.company_id }),
    })
    const json = await res.json()
    if (!res.ok) {
      setInviteError(json.error ?? 'Erreur lors de l\'invitation.')
    } else {
      setInviteSuccess(`Invitation envoyée à ${inviteEmail.trim()} !`)
      setInviteEmail(''); setInviteName(''); setInviteRole('commercial')
      fetchMembers()
    }
    setInviting(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('users').delete().eq('id', deleteId)
    setMembers((prev) => prev.filter((m) => m.id !== deleteId))
    setDeleteId(null)
    setDeleting(false)
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <div>
      <Header title="Équipe" />
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Équipe</h1>
          {isAdmin && (
            <Button onClick={() => { setModalOpen(true); setInviteSuccess('') }} size="sm" className="ml-auto">
              <UserPlus className="w-4 h-4 mr-1.5" />Inviter
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#64748B]">Aucun membre dans l'équipe.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const pubCount = portfolioCounts[member.id] ?? 0
              const isMe = member.id === profile?.id
              return (
                <Card
                  key={member.id}
                  className="flex items-center gap-4"
                  onClick={() => handleViewPortfolio(member)}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#1E2761]/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-[#1E2761]">{member.full_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#1E293B] truncate">{member.full_name}</p>
                      {member.role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-[#64748B]">
                        <Mail className="w-3 h-3" />{member.email}
                      </span>
                      {pubCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-[#64748B]">
                          <Briefcase className="w-3 h-3" />{pubCount} client{pubCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      member.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                    {!member.is_active && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">En attente</span>
                    )}
                    {isAdmin && !isMe && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(member.id) }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Portfolio viewer modal */}
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

      {/* Invite modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setInviteError(''); setInviteSuccess('') }} title="Inviter un commercial">
        {inviteSuccess ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-medium text-[#1E293B] mb-1">Invitation envoyée !</p>
            <p className="text-sm text-[#64748B] mb-4">{inviteSuccess}</p>
            <Button onClick={() => setInviteSuccess('')} variant="secondary" className="w-full">Inviter quelqu'un d'autre</Button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <Input id="inviteName" label="Nom complet" placeholder="Marie Martin"
              value={inviteName} onChange={(e) => setInviteName(e.target.value)} required autoFocus />
            <Input id="inviteEmail" type="email" label="Email" placeholder="marie@exemple.com"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Rôle</label>
              <div className="flex rounded-xl bg-gray-100 p-1">
                <button type="button" onClick={() => setInviteRole('commercial')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${inviteRole === 'commercial' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'}`}>
                  Commercial
                </button>
                <button type="button" onClick={() => setInviteRole('admin')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${inviteRole === 'admin' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'}`}>
                  Admin
                </button>
              </div>
            </div>
            {inviteError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{inviteError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} className="flex-1">Annuler</Button>
              <Button type="submit" loading={inviting} className="flex-1">Envoyer l'invitation</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Retirer ce membre">
        <p className="text-sm text-[#64748B] mb-4">
          Cette action supprimera le membre de l'équipe. Son compte ne pourra plus accéder à l'application.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)} className="flex-1">Annuler</Button>
          <Button onClick={handleDelete} loading={deleting} className="flex-1 bg-red-500 hover:bg-red-600 text-white border-red-500">Retirer</Button>
        </div>
      </Modal>
    </div>
  )
}

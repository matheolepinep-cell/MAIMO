'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronRight, MapPin, Briefcase, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Input } from '@/components/ui/Input'
import type { Account } from '@/types/database'

async function getAccessibleAccountIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string
): Promise<string[]> {
  const { data: entries } = await supabase
    .from('portfolio')
    .select('id, account_id, user_id, visibility')
    .eq('company_id', companyId)

  const entryIds = (entries ?? []).map((p: { id: string }) => p.id)

  const { data: myAccess } = entryIds.length > 0
    ? await supabase.from('portfolio_access').select('portfolio_id').in('portfolio_id', entryIds).eq('user_id', userId)
    : { data: [] }

  const myAccessSet = new Set((myAccess ?? []).map((a: { portfolio_id: string }) => a.portfolio_id))

  return (entries ?? [])
    .filter((p: { user_id: string; visibility: string; id: string }) =>
      p.user_id === userId ||
      p.visibility === 'team' ||
      (p.visibility === 'custom' && myAccessSet.has(p.id))
    )
    .map((p: { account_id: string }) => p.account_id)
}

export default function AccountsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'client' | 'prospect'>('all')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchAccounts = async () => {
    if (!profile?.company_id) return
    const supabase = createClient()

    let accountIds: string[]
    if (profile.role === 'admin') {
      const { data } = await supabase.from('accounts').select('id').eq('company_id', profile.company_id)
      accountIds = (data ?? []).map((a: { id: string }) => a.id)
    } else {
      accountIds = await getAccessibleAccountIds(supabase, profile.id, profile.company_id)
    }

    if (accountIds.length === 0) { setAccounts([]); setLoading(false); return }

    const { data } = await supabase
      .from('accounts')
      .select('*')
      .in('id', accountIds)
      .order('created_at', { ascending: false })

    setAccounts(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!profileLoading) fetchAccounts()
  }, [profileLoading, profile])

  const handleDelete = async (accountId: string) => {
    setDeletingId(accountId)
    const supabase = createClient()

    // Delete in dependency order to respect FK constraints
    await supabase.from('chunks').delete().eq('account_id', accountId)
    await supabase.from('notes').delete().eq('account_id', accountId)
    await supabase.from('documents').delete().eq('account_id', accountId)
    await supabase.from('contacts').delete().eq('account_id', accountId)

    // Portfolio access rows (via portfolio ids for this account)
    const { data: pfEntries } = await supabase
      .from('portfolio')
      .select('id')
      .eq('account_id', accountId)
    const pfIds = (pfEntries ?? []).map((p: { id: string }) => p.id)
    if (pfIds.length > 0) {
      await supabase.from('portfolio_access').delete().in('portfolio_id', pfIds)
    }
    await supabase.from('portfolio').delete().eq('account_id', accountId)

    await supabase.from('accounts').delete().eq('id', accountId)

    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setConfirmDeleteId(null)
    setDeletingId(null)
  }

  const filtered = accounts
    .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)

  return (
    <div>
      <Header title="Entreprises" />
      <div className="px-4 py-4 md:px-8 md:py-8 overflow-x-hidden">

        <Breadcrumb items={[
          { label: 'MAIMOO', href: '/app/dashboard' },
          { label: 'Entreprises' },
        ]} />

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-[#0F172A] hidden md:block">Entreprises accessibles</h1>
        </div>

        <div className="flex gap-2 mb-3">
          {(['all', 'client', 'prospect'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150"
              style={statusFilter === f ? {
                background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)',
                color: 'white',
              } : {
                background: 'white',
                color: '#64748B',
                border: '1px solid rgba(30,39,97,0.12)',
              }}
            >
              {f === 'all' ? 'Tous' : f === 'client' ? 'Clients' : 'Prospects'}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <Input placeholder="Rechercher une entreprise..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse"
              style={{ border: '1px solid rgba(30,39,97,0.06)' }} />
          ))}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {search || statusFilter !== 'all' ? 'Aucune entreprise trouvée.' : 'Aucune entreprise accessible pour le moment.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((account) => {
              const isConfirming = confirmDeleteId === account.id
              const isDeleting = deletingId === account.id

              return (
                <div
                  key={account.id}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 transition-all duration-200"
                  style={{
                    border: isConfirming ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(30,39,97,0.08)',
                    boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)',
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
                    style={{ background: 'rgba(76,110,245,0.1)' }}
                    onClick={() => !isConfirming && router.push(`/app/accounts/${account.id}`)}
                  >
                    <Building2 className="w-5 h-5 text-[#4C6EF5]" />
                  </div>

                  {/* Info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !isConfirming && router.push(`/app/accounts/${account.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#0F172A] truncate">{account.name}</p>
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={account.status === 'prospect' ? {
                          background: 'rgba(30,39,97,0.05)',
                          color: 'rgba(30,39,97,0.5)',
                          borderColor: 'rgba(30,39,97,0.1)',
                        } : {
                          background: 'rgba(30,39,97,0.12)',
                          color: '#1E2761',
                          borderColor: 'rgba(30,39,97,0.2)',
                        }}
                      >
                        {account.status === 'prospect' ? 'Prospect' : 'Client'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {account.city && <span className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="w-3 h-3" />{account.city}</span>}
                      {account.industry && <span className="flex items-center gap-1 text-xs text-slate-400"><Briefcase className="w-3 h-3" />{account.industry}</span>}
                    </div>
                  </div>

                  {/* Right actions */}
                  {isConfirming ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-xs text-red-500 font-medium hidden sm:block">Supprimer ?</p>
                      <button
                        onClick={() => handleDelete(account.id)}
                        disabled={isDeleting}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-60"
                      >
                        {isDeleting ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                        Oui
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-all"
                      >
                        Non
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(account.id) }}
                        className="p-2 rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight
                        className="w-4 h-4 text-slate-300 cursor-pointer"
                        onClick={() => router.push(`/app/accounts/${account.id}`)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

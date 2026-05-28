'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronRight, MapPin, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
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

  const filtered = accounts
    .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)

  return (
    <div>
      <Header title="Entreprises accessibles" />
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Entreprises accessibles</h1>
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
            <p className="text-[#64748B]">
              {search || statusFilter !== 'all' ? 'Aucune entreprise trouvée.' : 'Aucune entreprise accessible pour le moment.'}
            </p>
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
                    {account.city && <span className="flex items-center gap-1 text-xs text-[#64748B]"><MapPin className="w-3 h-3" />{account.city}</span>}
                    {account.industry && <span className="flex items-center gap-1 text-xs text-[#64748B]"><Briefcase className="w-3 h-3" />{account.industry}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

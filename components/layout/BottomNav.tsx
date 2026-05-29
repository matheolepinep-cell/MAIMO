'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Briefcase, Plus, User } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useUser()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState<'client' | 'prospect'>('client')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !profile) return
    setCreating(true); setError('')
    const supabase = createClient()

    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .insert({
        name: name.trim(),
        city: city.trim() || null,
        industry: industry.trim() || null,
        status,
        company_id: profile.company_id,
        created_by: profile.id,
      })
      .select().single()

    if (accErr || !acc) { setError(accErr?.message ?? 'Erreur.'); setCreating(false); return }

    await supabase.from('portfolio').insert({
      user_id: profile.id,
      account_id: acc.id,
      company_id: profile.company_id,
      visibility: 'team',
    })

    setOpen(false)
    setName(''); setCity(''); setIndustry(''); setStatus('client')
    router.push(`/app/accounts/${acc.id}`)
  }

  const isSearch = pathname.startsWith('/app/search') || pathname.startsWith('/app/dashboard')
  const isPortfolio = pathname.startsWith('/app/portfolio')
  const isProfile = pathname.startsWith('/app/profile')

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 shadow-lg z-40 pb-safe">
        <div className="flex items-stretch h-16">
          <Link href="/app/search" className={clsx('flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200', isSearch ? 'text-[#1E2761]' : 'text-slate-400')}>
            <Search className="w-5 h-5" />
            {isSearch && <span className="w-1 h-1 rounded-full bg-[#1E2761]" />}
          </Link>

          <Link href="/app/portfolio" className={clsx('flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200', isPortfolio ? 'text-[#1E2761]' : 'text-slate-400')}>
            <Briefcase className="w-5 h-5" />
            {isPortfolio && <span className="w-1 h-1 rounded-full bg-[#1E2761]" />}
          </Link>

          <button onClick={() => setOpen(true)} className="flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 bg-[#1E2761] rounded-2xl flex items-center justify-center shadow-lg shadow-[#1E2761]/20 -mt-3">
              <Plus className="w-5 h-5 text-white" />
            </div>
          </button>

          <Link href="/app/profile" className={clsx('flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200', isProfile ? 'text-[#1E2761]' : 'text-slate-400')}>
            <User className="w-5 h-5" />
            {isProfile && <span className="w-1 h-1 rounded-full bg-[#1E2761]" />}
          </Link>
        </div>
      </nav>

      <BottomSheet open={open} onClose={() => { setOpen(false); setError('') }} title="Nouvelle entreprise">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input id="name" label="Raison sociale" placeholder="Entreprise Dupont" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input id="city" label="Ville (optionnel)" placeholder="Lyon" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input id="industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={industry} onChange={(e) => setIndustry(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Statut</label>
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => setStatus('client')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${status === 'client' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500'}`}>Client</button>
              <button type="button" onClick={() => setStatus('prospect')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${status === 'prospect' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500'}`}>Prospect</button>
            </div>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
          <p className="text-xs text-slate-400">Ajoutée à votre portefeuille, visible par toute l'équipe par défaut.</p>
          <div className="flex gap-2 pb-2">
            <Button variant="secondary" type="button" onClick={() => { setOpen(false); setError('') }} className="flex-1">Annuler</Button>
            <Button type="submit" loading={creating} className="flex-1">Créer</Button>
          </div>
        </form>
      </BottomSheet>
    </>
  )
}

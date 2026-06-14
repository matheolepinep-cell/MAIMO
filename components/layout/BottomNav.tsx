'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Briefcase, Plus, User, FileSpreadsheet, Building2 } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'
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
  const [sheet, setSheet] = useState<'menu' | 'create'>('menu')
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
    setSheet('menu')
    setName(''); setCity(''); setIndustry(''); setStatus('client')
    router.push(`/app/accounts/${acc.id}`)
  }

  const isSearch = pathname.startsWith('/app/search') || pathname.startsWith('/app/dashboard')
  const isPortfolio = pathname.startsWith('/app/portfolio')
  const isProfile = pathname.startsWith('/app/profile')

  function NavLink({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
    return (
      <Link href={href} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-all duration-200">
        <Icon
          className="w-6 h-6 transition-all duration-200"
          style={{ color: active ? '#0A0A0A' : '#CBD5E1' }}
        />
        <span
          className="text-[10px] font-medium transition-all duration-200"
          style={{ color: active ? '#0A0A0A' : '#CBD5E1' }}
        >
          {label}
        </span>
      </Link>
    )
  }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-stretch h-16">
          <NavLink href="/app/search" icon={Search} label="Accueil" active={isSearch} />
          <NavLink href="/app/portfolio" icon={Briefcase} label="Portfolio" active={isPortfolio} />

          <button onClick={() => setOpen(true)} className="flex-1 flex flex-col items-center justify-center">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg -mt-3"
              style={{
                background: 'linear-gradient(135deg, #0A0A0A 0%, #0A0A0A 100%)',
                boxShadow: '0 4px 14px rgba(30,39,97,0.35)',
              }}
            >
              <Plus className="w-5 h-5 text-white" />
            </div>
          </button>

          <NavLink href="/app/profile" icon={User} label="Profil" active={isProfile} />
        </div>
      </nav>

      <BottomSheet
        open={open}
        onClose={() => { setOpen(false); setError(''); setSheet('menu') }}
        title={sheet === 'menu' ? 'Ajouter' : 'Nouvelle entreprise'}
      >
        {sheet === 'menu' ? (
          <div className="space-y-3 pb-2">
            <button
              onClick={() => setSheet('create')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200 hover:bg-[rgba(76,110,245,0.04)]"
              style={{ border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,0,0,0.06)' }}>
                <Building2 className="w-5 h-5 text-[#0A0A0A]" />
              </div>
              <div>
                <p className="font-medium text-[#0F172A] text-sm">Nouvelle entreprise</p>
                <p className="text-xs text-slate-400 mt-0.5">Créer une fiche manuellement</p>
              </div>
            </button>
            <button
              onClick={() => { setOpen(false); setSheet('menu'); router.push('/app/import') }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200 hover:bg-[rgba(76,110,245,0.04)]"
              style={{ border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)' }}>
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-[#0F172A] text-sm">Importer une liste clients</p>
                <p className="text-xs text-slate-400 mt-0.5">Analyse IA — .xlsx, .csv, .pdf…</p>
              </div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <Input id="name" label="Raison sociale" placeholder="Entreprise Dupont" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Input id="city" label="Ville (optionnel)" placeholder="Lyon" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input id="industry" label="Secteur (optionnel)" placeholder="Charpente, toiture..." value={industry} onChange={(e) => setIndustry(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Statut</label>
              <div className="flex rounded-xl bg-[#F5F5F5] p-1">
                <button type="button" onClick={() => setStatus('client')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${status === 'client' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500'}`}>Client</button>
                <button type="button" onClick={() => setStatus('prospect')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${status === 'prospect' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500'}`}>Prospect</button>
              </div>
            </div>
            {error && <FormMessage type="error" message={error} />}
            <p className="text-xs text-slate-400">Ajoutée à votre portefeuille, visible par toute l'équipe par défaut.</p>
            <div className="flex gap-2 pb-2">
              <Button variant="secondary" type="button" onClick={() => setSheet('menu')} className="flex-1">Retour</Button>
              <Button type="submit" loading={creating} className="flex-1">Créer</Button>
            </div>
          </form>
        )}
      </BottomSheet>
    </>
  )
}

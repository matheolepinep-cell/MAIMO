'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Mic, FileText, Search, Zap, Shield, Users } from 'lucide-react'
import { AuthModal } from '@/components/AuthModal'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type ModalView = 'login' | 'register'

export default function LandingPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>('login')

  // Invite flow
  const [inviteMode, setInviteMode] = useState(false)
  const [inviteReady, setInviteReady] = useState(false)
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteConfirm, setInviteConfirm] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  const openLogin = () => { setModalView('login'); setModalOpen(true) }
  const openRegister = () => { setModalView('register'); setModalOpen(true) }

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash.includes('access_token')) return

    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken) return

    setInviteMode(true)
    window.history.replaceState(null, '', window.location.pathname)

    const supabase = createClient()
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken ?? '',
    }).then(({ error }) => {
      if (error) {
        setInviteError('Lien invalide ou expiré. Demandez une nouvelle invitation.')
        return
      }
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) {
          setInviteError('Lien invalide ou expiré. Demandez une nouvelle invitation.')
          return
        }
        const meta = user.user_metadata
        const fullName = ((meta?.full_name as string | undefined) ?? '').trim()
        const parts = fullName.split(' ')
        setInviteFirstName(parts[0] ?? '')
        setInviteLastName(parts.slice(1).join(' ') ?? '')
        setInviteReady(true)
      })
    })
  }, [])

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteFirstName.trim()) { setInviteError('Le prénom est requis.'); return }
    if (invitePassword !== inviteConfirm) { setInviteError('Les mots de passe ne correspondent pas.'); return }
    setInviteError('')
    setInviteLoading(true)

    const supabase = createClient()
    const fullName = `${inviteFirstName.trim()} ${inviteLastName.trim()}`.trim()

    const { error: pwError } = await supabase.auth.updateUser({
      password: invitePassword,
      data: { full_name: fullName },
    })
    if (pwError) { setInviteError(pwError.message); setInviteLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const meta = user.user_metadata
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single()
      if (profile) {
        await supabase.from('users').update({ full_name: fullName, is_active: true }).eq('id', user.id)
      } else {
        await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: meta?.role ?? 'commercial',
          company_id: meta?.company_id ?? null,
          is_active: true,
        })
      }

      // Create workspace memberships from invite metadata
      const wsInvites = (meta?.workspaces as { wsId: string; role: 'admin' | 'member' }[] | undefined) ?? []
      if (wsInvites.length > 0) {
        await supabase.from('workspace_members').upsert(
          wsInvites.map((w) => ({ workspace_id: w.wsId, user_id: user.id, role: w.role })),
          { onConflict: 'workspace_id,user_id' }
        )
      }
    }

    router.push('/app/dashboard')
    router.refresh()
  }

  // ── Invite mode ──────────────────────────────────────────────────────────
  if (inviteMode) {
    return (
      <div className="min-h-screen bg-[#F0F4FF]">
        <nav className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm sticky top-0 z-40 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
              M
            </div>
            <span className="font-bold text-[#1E2761] text-lg">Maimoo</span>
          </div>
        </nav>

        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-7">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
                style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
                M
              </div>
              <span className="font-bold text-[#1E2761] text-lg">Maimoo</span>
            </div>

            {!inviteReady ? (
              <p className="text-sm text-center py-4 text-[#64748B]">
                {inviteError || 'Vérification du lien…'}
              </p>
            ) : (
              <>
                <h2 className="text-xl font-bold text-[#0F172A] mb-1">Bienvenue sur Maimoo</h2>
                <p className="text-sm text-[#64748B] mb-5">Créez votre accès</p>
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Input id="inv-first" label="Prénom" placeholder="Jean"
                      value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} required />
                    <Input id="inv-last" label="Nom" placeholder="Dupont"
                      value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} />
                  </div>
                  <Input id="inv-pass" type="password" label="Mot de passe" placeholder="••••••••"
                    value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} required minLength={8} />
                  <Input id="inv-confirm" type="password" label="Confirmer le mot de passe" placeholder="••••••••"
                    value={inviteConfirm} onChange={(e) => setInviteConfirm(e.target.value)} required />
                  {inviteError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{inviteError}</p>}
                  <Button type="submit" loading={inviteLoading} className="w-full" size="lg">
                    Rejoindre l&apos;espace <ArrowRight className="w-4 h-4 ml-1 inline" />
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Normal landing page ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0F4FF] overflow-x-hidden">
      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} defaultView={modalView} />

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm sticky top-0 z-40 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
            M
          </div>
          <span className="font-bold text-[#1E2761] text-lg">Maimoo</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openLogin}
            className="text-sm font-medium text-[#64748B] hover:text-[#1E2761] transition-colors"
          >
            Connexion
          </button>
          <button
            onClick={openRegister}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
          >
            Démarrer <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-20 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1E2761]/10 text-[#1E2761] text-xs font-semibold mb-6">
          <Zap className="w-3.5 h-3.5" />
          Mémoire commerciale augmentée
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-[#0F172A] leading-tight mb-6">
          Ne perdez plus<br />
          <span style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            aucune information client
          </span>
        </h1>
        <p className="text-lg text-[#64748B] leading-relaxed mb-8 max-w-2xl mx-auto">
          Maimoo centralise toutes vos notes, appels et documents clients en un seul endroit.
          Retrouvez instantanément n&apos;importe quelle information grâce à l&apos;IA.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={openRegister}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-base font-semibold text-white shadow-lg transition-all duration-200 hover:opacity-90 hover:shadow-xl"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
          >
            Créer mon espace gratuit <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={openLogin}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-base font-semibold text-[#1E2761] bg-white border border-slate-200 hover:border-[#1E2761]/30 transition-all duration-200"
          >
            Se connecter
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Mic,
              color: 'bg-red-50 text-red-500',
              title: 'Notes vocales',
              desc: "Dictez vos comptes-rendus en sortie de RDV. Maimoo transcrit et structure automatiquement.",
            },
            {
              icon: FileText,
              color: 'bg-blue-50 text-blue-500',
              title: 'Documents intelligents',
              desc: "Uploadez vos PDF, devis et contrats. L'IA extrait les infos clés et les rattache au bon client.",
            },
            {
              icon: Search,
              color: 'bg-purple-50 text-purple-500',
              title: 'Recherche sémantique',
              desc: "Posez une question en langage naturel. Maimoo retrouve la bonne information dans tout votre historique.",
            },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-[#0F172A] mb-2">{title}</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof strip */}
      <section className="bg-white border-y border-slate-100 px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-8">Pourquoi Maimoo ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { stat: '< 30s', label: 'pour enregistrer une note vocale' },
              { stat: '100%', label: 'de vos infos centralisées' },
              { stat: 'IA', label: "pour retrouver n'importe quoi" },
            ].map(({ stat, label }) => (
              <div key={stat}>
                <p className="text-3xl font-black text-[#1E2761] mb-1">{stat}</p>
                <p className="text-sm text-[#64748B]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Collab section */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
            <Users className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-2xl font-black text-[#0F172A] mb-3">Collaborez en équipe</h2>
            <p className="text-[#64748B] leading-relaxed">
              Invitez vos collaborateurs, partagez les fiches clients et gardez tout le monde aligné.
              Chaque membre garde sa propre vision tout en contribuant à la mémoire collective.
            </p>
          </div>
          <button
            onClick={openRegister}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
          >
            Essayer <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Security */}
      <section className="px-6 pb-16 max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-2 text-sm text-[#64748B]">
          <Shield className="w-4 h-4 text-[#1E2761]" />
          Données hébergées en Europe · Chiffrement bout-en-bout · RGPD
        </div>
      </section>

      {/* Footer CTA */}
      <section className="px-6 pb-20 text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-black text-[#0F172A] mb-4">Prêt à ne plus rien oublier ?</h2>
        <p className="text-[#64748B] mb-8">Créez votre espace en 2 minutes. Aucune carte bancaire requise.</p>
        <button
          onClick={openRegister}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold text-white shadow-lg transition-all duration-200 hover:opacity-90 hover:shadow-xl"
          style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
        >
          Créer mon espace gratuit <ArrowRight className="w-4 h-4" />
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-bold text-xs"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
            M
          </div>
          <span className="font-bold text-[#1E2761]">Maimoo</span>
        </div>
        <div className="flex items-center justify-center gap-4 mb-3">
          <Link href="/mentions-legales" className="text-xs text-[#94A3B8] hover:text-[#1E2761] transition-colors">
            Mentions légales
          </Link>
          <span className="text-[#E2E8F0]">·</span>
          <Link href="/confidentialite" className="text-xs text-[#94A3B8] hover:text-[#1E2761] transition-colors">
            Confidentialité
          </Link>
          <span className="text-[#E2E8F0]">·</span>
          <Link href="/contact" className="text-xs text-[#94A3B8] hover:text-[#1E2761] transition-colors">
            Contact
          </Link>
        </div>
        <p className="text-xs text-[#94A3B8]">© 2026 Maimoo. Tous droits réservés.</p>
      </footer>
    </div>
  )
}

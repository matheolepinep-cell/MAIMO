'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check, ChevronDown, Menu, X } from 'lucide-react'
import { AuthModal } from '@/components/AuthModal'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'

type ModalView = 'login' | 'register'

// ── CountUp ────────────────────────────────────────────────────────────────
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return
      started.current = true
      const steps = 30
      const duration = 1200
      let step = 0
      const timer = setInterval(() => {
        step++
        setCount(Math.round((target * step) / steps))
        if (step >= steps) clearInterval(timer)
      }, duration / steps)
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [target])

  return <span ref={ref}>{count}{suffix}</span>
}

// ── FAQ Item ───────────────────────────────────────────────────────────────
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #E5E5E5' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-5 text-left transition-colors"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A' }}>{question}</span>
        <div className="shrink-0 ml-4 transition-transform duration-200" style={{ transform: open ? 'rotate(45deg)' : 'rotate(0)' }}>
          <ChevronDown style={{ width: 20, height: 20, color: '#6B6B6B', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        </div>
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: open ? 300 : 0,
        transition: 'max-height 0.3s ease',
        paddingBottom: open ? 20 : 0,
      }}>
        <p style={{ fontSize: 15, color: '#6B6B6B', lineHeight: 1.7 }}>{answer}</p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>('login')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')

  // Early access form
  const [earlyEmail, setEarlyEmail] = useState('')
  const [earlyLoading, setEarlyLoading] = useState(false)
  const [earlyDone, setEarlyDone] = useState(false)
  const [earlyError, setEarlyError] = useState('')

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
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/app/dashboard')
    })
  }, [router])

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
      if (error) { setInviteError('Lien invalide ou expiré. Demandez une nouvelle invitation.'); return }
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) { setInviteError('Lien invalide ou expiré. Demandez une nouvelle invitation.'); return }
        const meta = user.user_metadata
        const fullName = ((meta?.full_name as string | undefined) ?? '').trim()
        const parts = fullName.split(' ')
        setInviteFirstName(parts[0] ?? '')
        setInviteLastName(parts.slice(1).join(' ') ?? '')
        setInviteReady(true)
      })
    })
  }, [])

  useEffect(() => {
    console.log(`-- Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS early_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  approved boolean DEFAULT false,
  magic_link_sent boolean DEFAULT false
);`)
  }, [])

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteFirstName.trim()) { setInviteError('Le prénom est requis.'); return }
    if (!invitePassword) { setInviteError('Veuillez choisir un mot de passe.'); return }
    if (invitePassword.length < 8) { setInviteError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    if (invitePassword !== inviteConfirm) { setInviteError('Les mots de passe ne correspondent pas.'); return }
    setInviteError('')
    setInviteLoading(true)
    const supabase = createClient()
    const fullName = `${inviteFirstName.trim()} ${inviteLastName.trim()}`.trim()
    const { error: pwError } = await supabase.auth.updateUser({ password: invitePassword, data: { full_name: fullName } })
    if (pwError) { setInviteError(pwError.message); setInviteLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const meta = user.user_metadata
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single()
      if (profile) {
        await supabase.from('users').update({ full_name: fullName, is_active: true }).eq('id', user.id)
      } else {
        await supabase.from('users').insert({
          id: user.id, email: user.email, full_name: fullName,
          role: meta?.role ?? 'commercial', company_id: meta?.company_id ?? null, is_active: true,
        })
      }
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

  const handleEarlyAccess = async (e: React.FormEvent) => {
    e.preventDefault()
    setEarlyError('')
    if (!earlyEmail.trim()) { setEarlyError('Veuillez entrer votre adresse email.'); return }
    setEarlyLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('early_access').insert({ email: earlyEmail })
    if (error) {
      setEarlyError(error.code === '23505' ? 'Cette adresse est déjà enregistrée.' : 'Une erreur est survenue, réessayez.')
      setEarlyLoading(false)
      return
    }
    setEarlyDone(true)
    setEarlyLoading(false)
  }

  // ── Invite mode ────────────────────────────────────────────────────────────
  if (inviteMode) {
    return (
      <div className="min-h-screen" style={{ background: '#F5F5F5' }}>
        <nav className="flex items-center px-6 py-4 bg-white sticky top-0 z-40" style={{ borderBottom: '1px solid #E5E5E5' }}>
          <Image src="/logo.png" alt="Maimoo" height={32} width={120} style={{ height: 32, width: 'auto' }} />
        </nav>
        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-2xl w-full max-w-sm p-7" style={{ border: '1px solid #E5E5E5', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
            <Image src="/logo.png" alt="Maimoo" height={28} width={100} style={{ height: 28, width: 'auto', marginBottom: 24 }} />
            {!inviteReady ? (
              <p className="text-sm text-center py-4" style={{ color: '#6B6B6B' }}>{inviteError || 'Vérification du lien…'}</p>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-1" style={{ color: '#0A0A0A' }}>Bienvenue sur Maimoo</h2>
                <p className="text-sm mb-5" style={{ color: '#6B6B6B' }}>Créez votre accès</p>
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Prénom</label>
                      <input className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }} placeholder="Jean" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Nom</label>
                      <input className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }} placeholder="Dupont" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Mot de passe</label>
                    <input type="password" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }} placeholder="••••••••" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Confirmer</label>
                    <input type="password" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }} placeholder="••••••••" value={inviteConfirm} onChange={(e) => setInviteConfirm(e.target.value)} />
                  </div>
                  {inviteError && <FormMessage type="error" message={inviteError} />}
                  <button type="submit" disabled={inviteLoading} className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60" style={{ background: '#0A0A0A' }}>
                    {inviteLoading ? 'Chargement…' : "Rejoindre l'espace"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  const gridBg = {
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
  }
  const gridBgDark = {
    backgroundImage: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
  }

  const PROBLEMS = [
    {
      num: '01',
      title: "L'information se perd entre les réunions",
      desc: "Vos commerciaux notent sur des bouts de papier, des mails, des notes vocales non classées. En 48h, tout est oublié.",
    },
    {
      num: '02',
      title: 'Le CRM reste vide',
      desc: 'Saisir manuellement chaque interaction est trop long. Résultat : le CRM est incomplet, inutile pour le management.',
    },
    {
      num: '03',
      title: 'Impossible de chercher dans ses notes',
      desc: 'Quand il faut retrouver une info avant un appel, personne ne sait où chercher. Chaque RDV repart de zéro.',
    },
  ]

  const BENEFITS = [
    {
      title: 'Capturer en 30 secondes',
      desc: "Dictez une note après un RDV. L'IA détecte le client, crée la fiche, classe automatiquement.",
    },
    {
      title: 'Retrouver en 3 secondes',
      desc: "Posez une question en langage naturel. L'IA cherche dans toutes vos notes et documents.",
    },
    {
      title: 'Partager sans effort',
      desc: "Toute l'équipe voit les informations clés. Plus de silos, plus de doublons, plus d'oublis.",
    },
  ]

  const STEPS = [
    { num: '1', title: 'Invitez votre équipe', desc: 'Créez un espace en 2 minutes, invitez vos commerciaux par email.' },
    { num: '2', title: 'Importez vos clients', desc: 'CSV, Excel ou saisie manuelle — vos fiches clients sont prêtes en quelques secondes.' },
    { num: '3', title: 'Commencez à noter', desc: "Vocal ou texte, depuis mobile ou desktop. L'IA fait le reste." },
  ]

  const TESTIMONIALS = [
    { name: 'Sophie M.', role: 'Directrice commerciale', quote: "En 3 semaines, notre équipe a capturé 2x plus d'infos clients qu'en 6 mois avec l'ancien CRM." },
    { name: 'Thomas L.', role: 'Commercial terrain', quote: 'Je dicte ma note en sortant du RDV. Le lendemain matin, tout est classé et partagé. Magique.' },
    { name: 'Julie R.', role: 'Manager équipe vente', quote: "La recherche IA m'a sauvé la vie avant un appel difficile. J'ai retrouvé tous les historiques en 5 secondes." },
  ]

  const PLANS = [
    {
      name: 'Starter',
      price: billing === 'monthly' ? 29 : 23,
      desc: 'Pour les petites équipes qui démarrent',
      features: ['3 utilisateurs', '500 notes / mois', 'Recherche IA', 'Import CSV', 'Support email'],
      cta: 'Commencer',
      highlight: false,
    },
    {
      name: 'Pro',
      price: billing === 'monthly' ? 79 : 63,
      desc: 'Pour les équipes commerciales en croissance',
      features: ['10 utilisateurs', 'Notes illimitées', 'Recherche IA avancée', 'Import documents (PDF, Word)', 'Espaces de travail', 'Support prioritaire'],
      cta: 'Commencer',
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: null,
      desc: 'Pour les grandes organisations',
      features: ['Utilisateurs illimités', 'SSO / SAML', 'API dédiée', 'SLA garanti', 'Accompagnement onboarding', 'Support dédié'],
      cta: 'Nous contacter',
      highlight: false,
    },
  ]

  const FAQS = [
    { question: 'Maimoo remplace-t-il mon CRM ?', answer: "Non, Maimoo complète votre CRM. Il capture tout ce que le CRM ne retient pas : notes informelles, documents, impressions d'appels. Vos deux outils travaillent ensemble." },
    { question: 'Combien de temps faut-il pour démarrer ?', answer: 'Moins de 5 minutes. Créez votre espace, invitez votre équipe, importez vos clients. Vous pouvez dicter votre première note dès le premier jour.' },
    { question: 'Mes données sont-elles sécurisées ?', answer: 'Oui. Vos données sont hébergées en Europe (Frankfurt, Allemagne), chiffrées au repos et en transit, conformes au RGPD.' },
    { question: 'Est-ce accessible sur mobile ?', answer: 'Maimoo est une PWA installable sur iPhone et Android. Elle fonctionne comme une vraie app native depuis votre écran d\'accueil.' },
    { question: 'Puis-je importer mes clients existants ?', answer: "Oui. Importez un fichier Excel ou CSV, l'IA mappe automatiquement les colonnes et crée les fiches clients en quelques secondes." },
  ]

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#FFFFFF', color: '#0A0A0A' }}>
      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} defaultView={modalView} />

      {/* ── NAVBAR pill ─────────────────────────────────────────────────────── */}
      <div className="fixed top-4 left-1/2 z-[100]" style={{ transform: 'translateX(-50%)', width: 'min(92vw, 860px)' }}>
        <nav className="flex items-center justify-between px-5 py-3 rounded-[40px] bg-white" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.08)', border: '1px solid #E5E5E5' }}>
          <Image src="/logo.png" alt="Maimoo" height={28} width={104} style={{ height: 28, width: 'auto' }} />

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm transition-colors" style={{ color: '#6B6B6B' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#0A0A0A' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6B6B6B' }}>
              Fonctionnalités
            </a>
            <a href="#pricing" className="text-sm transition-colors" style={{ color: '#6B6B6B' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#0A0A0A' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6B6B6B' }}>
              Tarifs
            </a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={openLogin} className="text-sm transition-colors" style={{ color: '#0A0A0A', background: 'none', border: 'none', cursor: 'pointer' }}>
              Se connecter
            </button>
            <button onClick={openRegister} className="px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90" style={{ background: '#0A0A0A', borderRadius: 20, border: 'none', cursor: 'pointer' }}>
              Commencer
            </button>
          </div>

          <div className="flex md:hidden items-center gap-2">
            <button onClick={openLogin} className="text-sm" style={{ color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Connexion</button>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              {mobileMenuOpen ? <X style={{ width: 20, height: 20, color: '#0A0A0A' }} /> : <Menu style={{ width: 20, height: 20, color: '#0A0A0A' }} />}
            </button>
          </div>
        </nav>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-2 rounded-2xl bg-white p-4 flex flex-col gap-3" style={{ border: '1px solid #E5E5E5', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
            <a href="#features" className="text-sm py-2" style={{ color: '#0A0A0A' }} onClick={() => setMobileMenuOpen(false)}>Fonctionnalités</a>
            <a href="#pricing" className="text-sm py-2" style={{ color: '#0A0A0A' }} onClick={() => setMobileMenuOpen(false)}>Tarifs</a>
            <button onClick={() => { openRegister(); setMobileMenuOpen(false) }} className="w-full py-2.5 text-sm font-semibold text-white rounded-xl" style={{ background: '#0A0A0A', border: 'none', cursor: 'pointer' }}>
              Commencer gratuitement
            </button>
          </div>
        )}
      </div>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section style={{ background: '#0A0A0A', paddingTop: 160, paddingBottom: 100, position: 'relative', overflow: 'hidden' }}>
        <div className="absolute inset-0" style={gridBg} aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm font-medium mb-6 inline-block px-4 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            Knowledge management commercial
          </p>
          <h1 className="font-black leading-none mb-6" style={{
            fontSize: 'clamp(40px, 7vw, 80px)',
            color: 'white',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}>
            La mémoire de votre<br />équipe commerciale
          </h1>
          <p className="mb-10 mx-auto" style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', maxWidth: 520, lineHeight: 1.6 }}>
            Capturez chaque information client en 30 secondes. Retrouvez tout en 3 secondes. Notes vocales, recherche IA, partage équipe.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={openRegister}
              className="font-semibold transition-all hover:opacity-90"
              style={{ background: 'white', color: '#0A0A0A', borderRadius: 24, padding: '14px 28px', fontSize: 15, border: 'none', cursor: 'pointer' }}
            >
              Commencer gratuitement
            </button>
            <button
              onClick={openLogin}
              className="font-medium transition-all hover:opacity-80"
              style={{ background: 'transparent', color: 'white', borderRadius: 24, padding: '14px 28px', fontSize: 15, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
            >
              Se connecter
            </button>
          </div>

          {/* App mockup */}
          <div className="mt-16 mx-auto" style={{ maxWidth: 860, borderRadius: 24, overflow: 'hidden', background: '#1A1A1A', boxShadow: '0 40px 80px rgba(0,0,0,0.4)', border: '1px solid #2A2A2A' }}>
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #2A2A2A' }}>
              <span className="w-3 h-3 rounded-full" style={{ background: '#DC2626' }} />
              <span className="w-3 h-3 rounded-full" style={{ background: '#D97706' }} />
              <span className="w-3 h-3 rounded-full" style={{ background: '#16A34A' }} />
              <span className="ml-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Maimoo — Recherche IA</span>
            </div>
            <div className="px-8 py-10">
              <div className="flex gap-3 mb-6">
                <div className="w-8 h-8 rounded-full shrink-0" style={{ background: '#2A2A2A' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded" style={{ background: '#2A2A2A', width: '70%' }} />
                  <div className="h-3 rounded" style={{ background: '#2A2A2A', width: '50%' }} />
                </div>
              </div>
              <div className="flex justify-end mb-6">
                <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: '#0A0A0A', color: 'white', maxWidth: '60%', border: '1px solid #2A2A2A' }}>
                  Résume les dernières notes sur TechCorp
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 rounded" style={{ background: '#2A2A2A', width: '90%' }} />
                <div className="h-3 rounded" style={{ background: '#2A2A2A', width: '75%' }} />
                <div className="h-3 rounded" style={{ background: '#2A2A2A', width: '82%' }} />
                <div className="h-3 rounded" style={{ background: '#2A2A2A', width: '60%' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CHIFFRES CLÉS ───────────────────────────────────────────────────── */}
      <section style={{ background: '#F5F5F5', padding: '64px 24px' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: 30, suffix: 's', label: 'pour capturer une note' },
            { value: 3, suffix: 's', label: 'pour retrouver une info' },
            { value: 100, suffix: '%', label: 'des informations partagées' },
          ].map(({ value, suffix, label }) => (
            <div key={label}>
              <div className="font-black mb-2" style={{ fontSize: 'clamp(36px,5vw,56px)', color: '#0A0A0A', lineHeight: 1 }}>
                <CountUp target={value} suffix={suffix} />
              </div>
              <p className="text-sm" style={{ color: '#6B6B6B' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROBLÈMES ───────────────────────────────────────────────────────── */}
      <section id="features" style={{ background: '#FFFFFF', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBgDark} aria-hidden="true" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-black mb-4" style={{ fontSize: 'clamp(28px,4vw,56px)', color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Vos commerciaux perdent<br />du temps chaque jour
            </h2>
            <p style={{ fontSize: 17, color: '#6B6B6B', maxWidth: 480, margin: '0 auto' }}>
              Trois problèmes qui freinent chaque équipe commerciale terrain.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PROBLEMS.map((p) => (
              <div key={p.num} className="rounded-2xl bg-white p-8" style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p className="font-black mb-4" style={{ fontSize: 72, color: '#F5F5F5', lineHeight: 1 }}>{p.num}</p>
                <h3 className="font-bold mb-3" style={{ fontSize: 17, color: '#0A0A0A' }}>{p.title}</h3>
                <p style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.6 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BÉNÉFICES ───────────────────────────────────────────────────────── */}
      <section style={{ background: '#0A0A0A', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBg} aria-hidden="true" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-black mb-4" style={{ fontSize: 'clamp(28px,4vw,56px)', color: 'white', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              La solution qui s'adapte<br />à votre rythme
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', maxWidth: 480, margin: '0 auto' }}>
              Pas de formation longue, pas de processus à réinventer.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl p-8" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
                <h3 className="font-bold mb-3" style={{ fontSize: 17, color: 'white' }}>{b.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMMENT ÇA MARCHE ───────────────────────────────────────────────── */}
      <section style={{ background: '#FFFFFF', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBgDark} aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-black mb-4" style={{ fontSize: 'clamp(28px,4vw,56px)', color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Opérationnel en 5 minutes
            </h2>
          </div>
          <div className="space-y-8">
            {STEPS.map((s) => (
              <div key={s.num} className="flex items-start gap-6">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-black text-white text-lg" style={{ background: '#0A0A0A' }}>
                  {s.num}
                </div>
                <div className="pt-2">
                  <h3 className="font-bold mb-1" style={{ fontSize: 18, color: '#0A0A0A' }}>{s.title}</h3>
                  <p style={{ fontSize: 15, color: '#6B6B6B', lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TÉMOIGNAGES ─────────────────────────────────────────────────────── */}
      <section style={{ background: '#F5F5F5', padding: '100px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-black mb-4" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
              Ce qu'en disent nos utilisateurs
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-7" style={{ border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p className="mb-6" style={{ fontSize: 15, color: '#0A0A0A', lineHeight: 1.7 }}>"{t.quote}"</p>
                <div>
                  <p className="font-semibold" style={{ color: '#0A0A0A', fontSize: 14 }}>{t.name}</p>
                  <p style={{ fontSize: 13, color: '#9B9B9B' }}>{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: '#FFFFFF', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBgDark} aria-hidden="true" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-black mb-4" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
              Des tarifs simples et transparents
            </h2>
            <div className="inline-flex items-center rounded-full p-1 mt-4" style={{ background: '#F5F5F5', border: '1px solid #E5E5E5' }}>
              {(['monthly', 'annual'] as const).map((b) => (
                <button key={b} onClick={() => setBilling(b)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={billing === b ? { background: '#0A0A0A', color: 'white', border: 'none', cursor: 'pointer' } : { background: 'transparent', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}>
                  {b === 'monthly' ? 'Mensuel' : 'Annuel −20%'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => (
              <div key={plan.name} className="rounded-2xl p-8 relative" style={{
                background: plan.highlight ? '#0A0A0A' : 'white',
                border: `1px solid ${plan.highlight ? '#0A0A0A' : '#E5E5E5'}`,
                boxShadow: plan.highlight ? '0 16px 48px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#0A0A0A', color: 'white', border: '2px solid white' }}>
                    Populaire
                  </span>
                )}
                <h3 className="font-bold text-lg mb-1" style={{ color: plan.highlight ? 'white' : '#0A0A0A' }}>{plan.name}</h3>
                <p className="text-sm mb-5" style={{ color: plan.highlight ? 'rgba(255,255,255,0.55)' : '#6B6B6B' }}>{plan.desc}</p>
                <div className="mb-6">
                  {plan.price !== null ? (
                    <>
                      <span className="font-black" style={{ fontSize: 40, color: plan.highlight ? 'white' : '#0A0A0A' }}>{plan.price}€</span>
                      <span className="text-sm ml-1" style={{ color: plan.highlight ? 'rgba(255,255,255,0.4)' : '#9B9B9B' }}>/mois</span>
                    </>
                  ) : (
                    <span className="font-bold text-2xl" style={{ color: plan.highlight ? 'white' : '#0A0A0A' }}>Sur devis</span>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <Check style={{ width: 14, height: 14, color: plan.highlight ? 'rgba(255,255,255,0.7)' : '#16A34A', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.8)' : '#0A0A0A' }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={openRegister}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={plan.highlight
                    ? { background: 'white', color: '#0A0A0A', border: 'none', cursor: 'pointer' }
                    : { background: '#0A0A0A', color: 'white', border: 'none', cursor: 'pointer' }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACCÈS ANTICIPÉ ──────────────────────────────────────────────────── */}
      <section style={{ background: '#0A0A0A', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBg} aria-hidden="true" />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="font-black mb-4" style={{ fontSize: 'clamp(28px,4vw,48px)', color: 'white', letterSpacing: '-0.02em' }}>
            Réservez votre accès anticipé
          </h2>
          <p className="mb-8" style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            Soyez parmi les premiers à essayer Maimoo. Accès prioritaire, prix fondateur.
          </p>
          {earlyDone ? (
            <div className="flex items-center justify-center gap-3 py-4">
              <Check style={{ width: 20, height: 20, color: '#16A34A' }} />
              <p style={{ color: 'white', fontSize: 16 }}>Vous êtes sur la liste ! On vous contacte très vite.</p>
            </div>
          ) : (
            <form onSubmit={handleEarlyAccess} className="flex gap-3 max-w-md mx-auto flex-col sm:flex-row">
              <input
                type="email"
                placeholder="votre@email.com"
                value={earlyEmail}
                onChange={(e) => setEarlyEmail(e.target.value)}
                className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: 'white' }}
              />
              <button type="submit" disabled={earlyLoading}
                className="px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'white', color: '#0A0A0A', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {earlyLoading ? 'Chargement…' : 'Rejoindre la liste'}
              </button>
            </form>
          )}
          {earlyError && <p className="mt-3 text-sm" style={{ color: '#DC2626' }}>{earlyError}</p>}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section style={{ background: '#FFFFFF', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBgDark} aria-hidden="true" />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="font-black mb-12 text-center" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
            Questions fréquentes
          </h2>
          <div>
            {FAQS.map((faq) => (
              <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────────────── */}
      <section style={{ background: '#0A0A0A', padding: '100px 24px', position: 'relative' }}>
        <div className="absolute inset-0" style={gridBg} aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="font-black mb-6" style={{ fontSize: 'clamp(32px,5vw,64px)', color: 'white', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            Votre équipe mérite<br />une vraie mémoire
          </h2>
          <p className="mb-10" style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', maxWidth: 440, margin: '0 auto 40px' }}>
            Rejoignez les équipes commerciales qui capturent et retrouvent chaque information.
          </p>
          <button onClick={openRegister} className="font-semibold transition-all hover:opacity-90"
            style={{ background: 'white', color: '#0A0A0A', borderRadius: 24, padding: '16px 36px', fontSize: 16, border: 'none', cursor: 'pointer' }}>
            Commencer gratuitement
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0A0A0A', borderTop: '1px solid #1A1A1A', padding: '40px 24px' }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Image src="/logo.png" alt="Maimoo" height={24} width={90} style={{ height: 24, width: 'auto', filter: 'brightness(0) invert(1)' }} />
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a href="/confidentialite" className="text-sm transition-colors" style={{ color: '#6B6B6B' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'white' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6B6B6B' }}>
              Confidentialité
            </a>
            <a href="/mentions-legales" className="text-sm transition-colors" style={{ color: '#6B6B6B' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'white' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6B6B6B' }}>
              Mentions légales
            </a>
            <a href="/contact" className="text-sm transition-colors" style={{ color: '#6B6B6B' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'white' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6B6B6B' }}>
              Contact
            </a>
          </div>
          <p className="text-sm" style={{ color: '#6B6B6B' }}>© 2025 Maimoo</p>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check, ChevronDown, Menu, X, MessageSquare, LayoutDashboard, Users, Shield, MapPin, Lock, EyeOff, Upload, Zap, Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthModal } from '@/components/AuthModal'
import { FormMessage } from '@/components/ui/FormMessage'
import { createClient } from '@/lib/supabase/client'
import { CarouselSection } from '@/components/landing/CarouselSection'

type ModalView = 'login' | 'register'

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

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

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #E5E7EB' }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between py-5 text-left" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A' }}>{question}</span>
        <span style={{ fontSize: 22, color: '#6B7280', flexShrink: 0, marginLeft: 16, display: 'block', transition: 'transform 0.3s', transform: open ? 'rotate(45deg)' : 'rotate(0)', lineHeight: 1 }}>+</span>
      </button>
      <div style={{ overflow: 'hidden', maxHeight: open ? 300 : 0, transition: 'max-height 0.3s ease', paddingBottom: open ? 20 : 0 }}>
        <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.7 }}>{answer}</p>
      </div>
    </div>
  )
}

const PLANS = [
  {
    name: 'Solo', monthlyPrice: 19, annualPrice: 15, priceNote: '/mois',
    desc: 'Pour les commerciaux indépendants', highlight: false,
    features: ['1 utilisateur, 1 espace', 'Portefeuille illimité', 'Notes texte et vocales illimitées', 'Recherche IA illimitée', '10 imports de documents / mois', "Import Excel jusqu'à 200 lignes", '5 Go de stockage', 'Support email'],
  },
  {
    name: 'Team', monthlyPrice: 39, annualPrice: 31, priceNote: '/utilisateur/mois',
    desc: 'Pour les équipes commerciales en croissance', highlight: true,
    features: ["Jusqu'à 25 utilisateurs, 3 espaces", 'Tout Solo inclus', 'Portefeuille partagé', 'Messagerie interne temps réel', 'Notifications et activité équipe', 'Détection de conflits IA', '50 imports de documents / mois / espace', "Import Excel jusqu'à 1000 lignes", '50 Go de stockage', 'Support prioritaire'],
  },
  {
    name: 'Business', monthlyPrice: 59, annualPrice: 47, priceNote: '/utilisateur/mois',
    desc: 'Pour les grandes organisations commerciales', highlight: false,
    features: ['Utilisateurs illimités, 5 espaces isolés', 'Tout Team inclus', 'Super Admin tous accès', 'Imports illimités', 'Import Excel sans limite de lignes', 'Fiche entreprise IA personnalisée', 'Stockage illimité', 'Support dédié + onboarding'],
  },
]

const FAQS = [
  { question: 'Maimoo remplace-t-il mon CRM ?', answer: "Non — Maimoo complète votre CRM. Il capture ce que le CRM ne retient pas : les impressions d'un appel, les documents reçus, les informations informelles qui font la différence. Vos deux outils travaillent ensemble." },
  { question: 'Combien de temps faut-il pour démarrer ?', answer: "Moins de 5 minutes. Importez vos clients, invitez votre équipe. L'onboarding est immédiat — aucune formation requise." },
  { question: 'Mes données sont-elles sécurisées ?', answer: "Vos données sont hébergées en Europe, chiffrées, conformes au RGPD. Chaque organisation est isolée au niveau de la base de données. Aucun accès croisé n'est techniquement possible." },
  { question: 'Est-ce accessible sur mobile ?', answer: "Maimoo est une application installable sur iPhone et Android depuis votre navigateur. Elle fonctionne comme une vraie application native — sans passer par l'App Store." },
  { question: 'Puis-je importer mes clients existants ?', answer: "Oui. Un fichier Excel ou CSV suffit. L'IA mappe automatiquement vos colonnes et crée les fiches clients en quelques secondes." },
  { question: 'Mes données passent-elles par des serveurs américains ?', answer: "Vos données sont stockées en Europe (Frankfurt, Allemagne). Nos fonctionnalités d'IA font appel à des prestataires américains (Anthropic, OpenAI) encadrés par des Clauses Contractuelles Types RGPD. Seul le contenu nécessaire au traitement est transmis temporairement — il n'est jamais utilisé pour entraîner leurs modèles." },
]

const gridBgDark = {
  backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
}

export default function LandingPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>('login')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [earlyEmail, setEarlyEmail] = useState('')
  const [earlyLoading, setEarlyLoading] = useState(false)
  const [earlyDone, setEarlyDone] = useState(false)
  const [earlyError, setEarlyError] = useState('')
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
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' }).then(({ error }) => {
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
        await supabase.from('users').insert({ id: user.id, email: user.email, full_name: fullName, role: meta?.role ?? 'commercial', company_id: meta?.company_id ?? null, is_active: true })
      }
      const wsInvites = (meta?.workspaces as { wsId: string; role: 'admin' | 'member' }[] | undefined) ?? []
      if (wsInvites.length > 0) {
        await supabase.from('workspace_members').upsert(wsInvites.map((w) => ({ workspace_id: w.wsId, user_id: user.id, role: w.role })), { onConflict: 'workspace_id,user_id' })
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

  if (inviteMode) {
    return (
      <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
        <nav className="flex items-center px-6 py-4 bg-white sticky top-0 z-40" style={{ borderBottom: '1px solid #E5E7EB' }}>
          <Image src="/logo.png" alt="Maimoo" height={32} width={120} style={{ height: 32, width: 'auto' }} />
        </nav>
        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-2xl w-full max-w-sm p-7" style={{ border: '1px solid #E5E7EB', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
            <Image src="/logo.png" alt="Maimoo" height={28} width={100} style={{ height: 28, width: 'auto', marginBottom: 24 }} />
            {!inviteReady ? (
              <p className="text-sm text-center py-4" style={{ color: '#6B7280' }}>{inviteError || 'Vérification du lien…'}</p>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-1" style={{ color: '#0A0A0A' }}>Bienvenue sur Maimoo</h2>
                <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Créez votre accès</p>
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Prénom</label>
                      <input className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E7EB', color: '#0A0A0A' }} placeholder="Jean" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Nom</label>
                      <input className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E7EB', color: '#0A0A0A' }} placeholder="Dupont" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Mot de passe</label>
                    <input type="password" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E7EB', color: '#0A0A0A' }} placeholder="••••••••" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>Confirmer</label>
                    <input type="password" className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid #E5E7EB', color: '#0A0A0A' }} placeholder="••••••••" value={inviteConfirm} onChange={(e) => setInviteConfirm(e.target.value)} />
                  </div>
                  {inviteError && <FormMessage type="error" message={inviteError} />}
                  <button type="submit" disabled={inviteLoading} className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60" style={{ background: '#2563EB' }}>
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

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#FFFFFF', color: '#374151' }}>
      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} defaultView={modalView} />

      {/* Fixed grid overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px', zIndex: 0 }} aria-hidden="true" />

      {/* ── NAVBAR ── */}
      <div className="fixed top-4 left-1/2 z-[100]" style={{ transform: 'translateX(-50%)', width: 'min(92vw, 860px)' }}>
        <nav className="flex items-center justify-between bg-white" style={{ borderRadius: 40, padding: '10px 24px', boxShadow: '0 2px 20px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB' }}>
          <Image src="/logo.png" alt="Maimoo" height={28} width={104} style={{ height: 28, width: 'auto' }} />
          <div className="hidden md:flex items-center gap-8">
            {[['#fonctionnalites', 'Fonctionnalités'], ['#tarifs', 'Tarifs']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 14, color: '#374151', textDecoration: 'none' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#2563EB' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#374151' }}>{label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button onClick={openLogin} style={{ fontSize: 14, color: '#0A0A0A', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#2563EB' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#0A0A0A' }}>Se connecter</button>
            <button onClick={openRegister} className="text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: '#2563EB', borderRadius: 20, padding: '8px 20px', border: 'none', cursor: 'pointer' }}>Commencer</button>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <button onClick={openLogin} style={{ fontSize: 14, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>Connexion</button>
            <button onClick={() => setMobileMenuOpen((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              {mobileMenuOpen ? <X style={{ width: 20, height: 20, color: '#0A0A0A' }} /> : <Menu style={{ width: 20, height: 20, color: '#0A0A0A' }} />}
            </button>
          </div>
        </nav>
        {mobileMenuOpen && (
          <div className="md:hidden mt-2 bg-white flex flex-col gap-3 p-4" style={{ borderRadius: 20, border: '1px solid #E5E7EB', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
            <a href="#fonctionnalites" style={{ fontSize: 14, color: '#0A0A0A', textDecoration: 'none', padding: '8px 0' }} onClick={() => setMobileMenuOpen(false)}>Fonctionnalités</a>
            <a href="#tarifs" style={{ fontSize: 14, color: '#0A0A0A', textDecoration: 'none', padding: '8px 0' }} onClick={() => setMobileMenuOpen(false)}>Tarifs</a>
            <button onClick={() => { openRegister(); setMobileMenuOpen(false) }} className="w-full text-sm font-semibold text-white" style={{ background: '#2563EB', border: 'none', cursor: 'pointer', borderRadius: 12, padding: '10px 0' }}>Commencer gratuitement</button>
          </div>
        )}
      </div>

      {/* ── HERO ── */}
      <section style={{ background: '#FFFFFF', paddingTop: 160, paddingBottom: 120, position: 'relative', overflow: 'hidden' }}>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div variants={stagger} initial="hidden" animate="visible">
            <motion.div variants={fadeInUp}>
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase mb-6" style={{ background: '#DBEAFE', color: '#2563EB', letterSpacing: '0.1em' }}>
                Knowledge Management Commercial
              </span>
            </motion.div>
            <motion.h1 variants={fadeInUp} className="font-black leading-none mb-6" style={{ fontSize: 'clamp(40px, 7vw, 72px)', color: '#0A0A0A', letterSpacing: '-0.03em', lineHeight: 1.05, maxWidth: 800, margin: '0 auto 24px' }}>
              Maimoo. Votre équipe commerciale{' '}
              <em style={{ color: '#2563EB', fontStyle: 'italic' }}>augmentée.</em>
            </motion.h1>
            <motion.p variants={fadeInUp} className="mb-10 mx-auto" style={{ fontSize: 20, color: '#6B7280', maxWidth: 560, lineHeight: 1.75 }}>
              Une IA qui connaît vos clients aussi bien que vous. Qui répond à vos questions comme un collègue. Qui ne perd jamais rien.
            </motion.p>
            <motion.div variants={fadeInUp} className="flex items-center justify-center gap-4 flex-wrap mb-16">
              <button onClick={openRegister} className="font-bold transition-opacity hover:opacity-90" style={{ background: '#2563EB', color: 'white', borderRadius: 24, padding: '14px 32px', fontSize: 16, border: 'none', cursor: 'pointer' }}>
                Commencer gratuitement
              </button>
              <button onClick={openLogin} className="font-medium transition-colors" style={{ background: 'transparent', color: '#374151', borderRadius: 24, padding: '13px 32px', fontSize: 16, border: '1.5px solid #E5E7EB', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2563EB'; (e.currentTarget as HTMLElement).style.color = '#2563EB' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLElement).style.color = '#374151' }}>
                Voir une démo
              </button>
            </motion.div>
          </motion.div>

          {/* Mockup */}
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
            className="text-left" style={{ maxWidth: 900, margin: '0 auto', borderRadius: 20, overflow: 'hidden', background: '#F9FAFB', boxShadow: '0 32px 80px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB' }}>
            <div className="flex items-center gap-2 px-5 py-3 bg-white" style={{ borderBottom: '1px solid #E5E7EB' }}>
              <span className="w-3 h-3 rounded-full" style={{ background: '#FCA5A5' }} />
              <span className="w-3 h-3 rounded-full" style={{ background: '#FCD34D' }} />
              <span className="w-3 h-3 rounded-full" style={{ background: '#86EFAC' }} />
              <span className="ml-4 text-xs" style={{ color: '#9CA3AF' }}>Maimoo — Recherche IA</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-end">
                <div className="px-4 py-3 text-sm text-white" style={{ background: '#0A0A0A', borderRadius: '16px 16px 4px 16px', maxWidth: '70%' }}>
                  Résume les dernières interactions avec TechCorp et dis-moi si on a un risque de churn.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: '#2563EB' }}>IA</div>
                <div className="flex-1 bg-white px-4 py-3" style={{ border: '1px solid #E5E7EB', borderRadius: '16px 16px 16px 4px' }}>
                  <p className="text-sm mb-3" style={{ color: '#374151', lineHeight: 1.6 }}>D'après vos 4 dernières notes sur TechCorp (avril–juin), voici ce que je retiens :</p>
                  <ul className="space-y-1 text-sm mb-3" style={{ color: '#374151' }}>
                    <li>— Budget réduit de 30% confirmé lors du call du 12 mai</li>
                    <li>— Décision remontée au COMEX, contact principal = Marie Dubois</li>
                    <li>— Besoin réel identifié mais calendrier décision repoussé à Q3</li>
                  </ul>
                  <p className="text-sm" style={{ color: '#6B7280' }}>Risque de churn modéré — je recommande un point avant fin juin.</p>
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[
                  { label: 'Note du 12/05', author: 'T. Leblanc', snippet: 'Budget réduit, décision COMEX...' },
                  { label: 'Note du 03/06', author: 'S. Martin', snippet: 'Marie Dubois confirme le report...' },
                  { label: 'Compte-rendu Q1', author: 'T. Leblanc', snippet: 'Besoins validés, attente budget...' },
                ].map((s) => (
                  <div key={s.label} className="shrink-0 bg-white px-3 py-2" style={{ borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', minWidth: 175 }}>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: '#2563EB' }}>{s.label}</p>
                    <p className="text-xs" style={{ color: '#9CA3AF' }}>{s.author}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B7280' }}>{s.snippet}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CHIFFRES CLÉS ── */}
      <section style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB', padding: '48px 24px' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-3">
          {[
            { value: 30, suffix: 's', label: 'Pour capturer un échange client' },
            { value: 3, suffix: 's', label: 'Pour retrouver n\'importe quelle information' },
            { value: 100, suffix: '%', label: 'Accessible depuis votre téléphone' },
          ].map(({ value, suffix, label }, i) => (
            <div key={label} className="text-center px-6 py-6" style={i > 0 ? { borderLeft: '1px solid #E5E7EB' } : {}}>
              <div className="font-extrabold mb-2" style={{ fontSize: 'clamp(36px,5vw,56px)', color: '#0A0A0A', lineHeight: 1 }}>
                <CountUp target={value} /><span style={{ color: '#2563EB' }}>{suffix}</span>
              </div>
              <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION VISION ── */}
      <section id="fonctionnalites" style={{ background: '#F9FAFB', padding: '120px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <motion.p variants={fadeInUp} style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>UNE NOUVELLE FAÇON DE TRAVAILLER</motion.p>
            <motion.h2 variants={fadeInUp} className="font-bold mb-5" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Une IA qui connaît vos clients<br />aussi bien que vous.
            </motion.h2>
            <motion.p variants={fadeInUp} style={{ fontSize: 18, color: '#6B7280', maxWidth: 600, margin: '0 auto', lineHeight: 1.75 }}>
              Pas un outil de saisie. Pas un CRM de plus. Une mémoire collective intelligente, connectée à toute votre équipe, interrogeable en langage naturel.
            </motion.p>
          </motion.div>
          <CarouselSection desktopClass="grid md:grid-cols-3 gap-6">
            {[
              { Icon: MessageSquare, num: '01', title: "Posez n'importe quelle question.", desc: "Quel est le contexte chez ce prospect ? Qui décide vraiment ? Qu'est-ce qui a été promis lors du dernier appel ? Une question naturelle. Une réponse immédiate, précise, sourcée." },
              { Icon: LayoutDashboard, num: '02', title: 'Un dashboard connecté à votre réalité commerciale.', desc: "Portefeuille client vivant, agenda synchronisé, activité équipe en temps réel, carte de vos clients. Tout ce dont un commercial a besoin, au même endroit." },
              { Icon: Users, num: '03', title: "Ce que sait un commercial, toute l'équipe peut le savoir.", desc: "L'information ne disparaît plus avec un départ. Elle grandit avec l'équipe. Elle devient un avantage concurrentiel durable." },
            ].map(({ Icon, num, title, desc }) => (
              <motion.div key={num} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="rounded-2xl p-10 relative overflow-hidden bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
                <p className="absolute top-6 right-6 font-black select-none" style={{ fontSize: 80, color: '#DBEAFE', lineHeight: 1 }}>{num}</p>
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ background: '#EFF6FF' }}>
                    <Icon style={{ width: 24, height: 24, color: '#2563EB' }} />
                  </div>
                  <h3 className="font-semibold mb-3" style={{ fontSize: 18, color: '#0A0A0A', lineHeight: 1.35 }}>{title}</h3>
                  <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.7 }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </CarouselSection>
        </div>
      </section>

      {/* ── SECTION RAG INNOVATION ── */}
      <section style={{ background: '#FFFFFF', padding: '120px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div variants={fadeInUp}>
              <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>TECHNOLOGIE</p>
              <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(28px,4vw,42px)', color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Pas un assistant générique.<br />Une IA entraînée sur vos données.
              </h2>
              <p className="mb-8" style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.75 }}>
                Maimoo repose sur une architecture RAG — Retrieval Augmented Generation. Concrètement : l'IA n'invente rien. Elle interroge uniquement vos notes, vos documents, vos comptes-rendus. Elle cite toujours sa source. Si l'information n'existe pas dans vos données, elle le dit.
              </p>
              <ul className="space-y-3 mb-8">
                {['Recherche vectorielle sur vos données privées', 'Réponses sourcées et traçables', 'Zéro hallucination, zéro invention', 'Mémoire conversationnelle sur 24h', "Détection automatique des conflits d'information"].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check style={{ width: 18, height: 18, color: '#2563EB', flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 15, color: '#374151' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {['RAG souverain', 'IA conversationnelle', 'Données 100% privées', 'Hébergement Europe', 'Multi-espaces isolés'].map((pill) => (
                  <span key={pill} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: '#DBEAFE', color: '#2563EB' }}>{pill}</span>
                ))}
              </div>
            </motion.div>
            <motion.div variants={fadeInUp} className="rounded-2xl p-6 space-y-3" style={{ background: '#0A0A0A', border: '1px solid #1F2937' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
                <span className="text-xs" style={{ color: '#6B7280' }}>Maimoo RAG engine — live</span>
              </div>
              {[
                { color: '#86EFAC', text: '→  "Quelles entreprises ont évoqué un problème de budget ce trimestre ?"' },
                { color: '#6B7280', text: '⟳  Indexation vectorielle : 1 247 chunks analysés' },
                { color: '#FFFFFF', bg: '#1D4ED8', text: '✓  3 entreprises trouvées : TechCorp · Acme SA · BTP Nord' },
                { color: '#6B7280', text: '📎  Sources : 3 notes · 1 compte-rendu · fiabilité 94%' },
              ].map(({ color, bg, text }, i) => (
                <div key={i} className="px-4 py-2.5 rounded-lg" style={{ background: bg ?? '#1A1A1A', border: '1px solid #2A2A2A' }}>
                  <p className="text-sm font-mono" style={{ color }}>{text}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── SECTION SÉCURITÉ ── */}
      <section style={{ background: '#F9FAFB', padding: '120px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <motion.p variants={fadeInUp} style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>SÉCURITÉ</motion.p>
            <motion.h2 variants={fadeInUp} className="font-bold mb-5" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
              Une sécurité infaillible.<br />Sans compromis.
            </motion.h2>
            <motion.p variants={fadeInUp} style={{ fontSize: 17, color: '#6B7280', maxWidth: 600, margin: '0 auto', lineHeight: 1.75 }}>
              Maimoo applique les standards de sécurité les plus stricts. Vos données ne quittent jamais l'Europe. Chaque espace est totalement isolé — techniquement impossible d'accéder aux données d'une autre organisation.
            </motion.p>
          </motion.div>
          <CarouselSection desktopClass="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { Icon: Shield, title: 'Chiffrement de bout en bout', desc: 'Vos données sont chiffrées au repos et en transit. Aucune information ne circule en clair.' },
              { Icon: MapPin, title: 'Hébergement souverain Europe', desc: 'Stockage des données en Allemagne (Frankfurt). Traitement IA via prestataires américains encadrés par des garanties contractuelles RGPD (Clauses Contractuelles Types).' },
              { Icon: Lock, title: 'Isolation totale des espaces', desc: 'Chaque organisation est cloisonnée au niveau de la base de données. Aucun accès croisé possible.' },
              { Icon: EyeOff, title: "Vos données n'entraînent aucun modèle", desc: 'Ce que vous écrivez reste chez vous. Jamais utilisé pour entraîner une IA tierce.' },
            ].map(({ Icon, title, desc }) => (
              <motion.div key={title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="rounded-xl p-7 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: '#EFF6FF' }}>
                  <Icon style={{ width: 20, height: 20, color: '#2563EB' }} />
                </div>
                <h3 className="font-semibold mb-2" style={{ fontSize: 16, color: '#0A0A0A' }}>{title}</h3>
                <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.65 }}>{desc}</p>
              </motion.div>
            ))}
          </CarouselSection>
        </div>
      </section>

      {/* ── COMMENT ÇA MARCHE ── */}
      <section style={{ background: '#FFFFFF', padding: '120px 24px' }}>
        <div className="max-w-3xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <motion.p variants={fadeInUp} style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>EN 3 ÉTAPES</motion.p>
            <motion.h2 variants={fadeInUp} className="font-bold" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Adopté en un jour.<br />Indispensable en une semaine.
            </motion.h2>
          </motion.div>
          <div className="relative">
            <div className="absolute hidden lg:block" style={{ left: 23, top: 48, bottom: 48, borderLeft: '2px dashed #DBEAFE', zIndex: 0 }} />
            <CarouselSection desktopClass="">
              {[
                { Icon: Upload, num: '01', title: 'Importez et capturez', desc: "Importez vos clients existants en un fichier. Capturez les nouvelles informations à la voix, par texte ou en important n'importe quel document. L'IA classe automatiquement." },
                { Icon: Zap, num: '02', title: "L'IA indexe et connecte", desc: "Chaque information est indexée, reliée à son client, rendue accessible à toute votre équipe. En temps réel." },
                { Icon: Search, num: '03', title: 'Interrogez en langage naturel', desc: "Posez une question comme vous la poseriez à un collègue. Obtenez une réponse précise, sourcée, en quelques secondes." },
              ].map(({ Icon, num, title, desc }) => (
                <motion.div key={num} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex gap-6 relative mb-10 last:mb-0">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative z-10" style={{ background: '#2563EB' }}>
                    <Icon style={{ width: 20, height: 20, color: 'white' }} />
                  </div>
                  <div className="pt-1 pb-2">
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{num}</p>
                    <h3 className="font-semibold mb-2" style={{ fontSize: 20, color: '#0A0A0A' }}>{title}</h3>
                    <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.7 }}>{desc}</p>
                  </div>
                </motion.div>
              ))}
            </CarouselSection>
          </div>
        </div>
      </section>

      {/* ── TÉMOIGNAGES ── */}
      <section style={{ background: '#F9FAFB', padding: '120px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <motion.p variants={fadeInUp} style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>ILS NOUS FONT CONFIANCE</motion.p>
            <motion.h2 variants={fadeInUp} className="font-bold" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
              Des équipes qui ne perdent plus rien.
            </motion.h2>
          </motion.div>
          <CarouselSection desktopClass="grid md:grid-cols-3 gap-6">
            {[
              { initials: 'SM', name: 'Sophie M.', role: 'Directrice Commerciale, PME industrielle', quote: "Avant, chaque départ de commercial était une catastrophe. Aujourd'hui toute la relation client reste dans l'équipe, accessible à tous, immédiatement." },
              { initials: 'TR', name: 'Thomas R.', role: 'Directeur des ventes, secteur BTP', quote: "Je pose une question sur un client en réunion et j'ai la réponse en quelques secondes. Mes équipes n'ont jamais été aussi alignées." },
              { initials: 'PL', name: 'Pierre L.', role: 'Directeur commercial, distribution', quote: "Ce n'est pas un outil de plus. C'est la première fois qu'une technologie s'adapte vraiment à la façon dont travaillent nos commerciaux terrain." },
            ].map(({ initials, name, role, quote }) => (
              <motion.div key={name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="bg-white rounded-2xl p-9 relative" style={{ border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
                <p className="absolute top-5 right-7 font-black select-none" style={{ fontSize: 64, color: '#DBEAFE', lineHeight: 1 }}>&ldquo;</p>
                <p className="relative italic mb-8" style={{ fontSize: 15, color: '#374151', lineHeight: 1.7 }}>{quote}</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: '#2563EB' }}>{initials}</div>
                  <div>
                    <p className="font-semibold" style={{ fontSize: 14, color: '#0A0A0A' }}>{name}</p>
                    <p style={{ fontSize: 12, color: '#9CA3AF' }}>{role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </CarouselSection>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: '#FFFFFF', padding: '120px 24px' }}>
        <div className="max-w-2xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <motion.p variants={fadeInUp} style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>QUESTIONS FRÉQUENTES</motion.p>
            <motion.h2 variants={fadeInUp} className="font-bold" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
              Tout ce que vous devez savoir.
            </motion.h2>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            {FAQS.map((faq) => <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />)}
          </motion.div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="tarifs" style={{ background: '#F9FAFB', padding: '120px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-12">
            <motion.p variants={fadeInUp} style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: '#2563EB', textTransform: 'uppercase', marginBottom: 16 }}>TARIFS</motion.p>
            <motion.h2 variants={fadeInUp} className="font-bold mb-6" style={{ fontSize: 'clamp(28px,4vw,48px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>Simple. Transparent. Sans surprise.</motion.h2>
            <motion.div variants={fadeInUp} className="inline-flex items-center rounded-full p-1" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
              {(['monthly', 'annual'] as const).map((b) => (
                <button key={b} onClick={() => setBilling(b)} className="px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2"
                  style={billing === b ? { background: '#0A0A0A', color: 'white', border: 'none', cursor: 'pointer' } : { background: 'transparent', color: '#6B7280', border: 'none', cursor: 'pointer' }}>
                  {b === 'monthly' ? 'Mensuel' : (<>Annuel <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: '#DBEAFE', color: '#2563EB' }}>-20%</span></>)}
                </button>
              ))}
            </motion.div>
          </motion.div>
          <CarouselSection desktopClass="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => {
              const price = billing === 'monthly' ? plan.monthlyPrice : plan.annualPrice
              return (
                <motion.div key={plan.name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="rounded-2xl p-9 relative bg-white" style={{ border: plan.highlight ? '2px solid #2563EB' : '1px solid #E5E7EB' }}>
                  {plan.highlight && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white" style={{ background: '#2563EB', whiteSpace: 'nowrap' }}>Populaire</span>
                  )}
                  <h3 className="font-bold text-lg mb-1" style={{ color: '#0A0A0A' }}>{plan.name}</h3>
                  <p className="text-sm mb-6" style={{ color: '#6B7280' }}>{plan.desc}</p>
                  <div className="mb-1">
                    <span className="font-extrabold" style={{ fontSize: 48, color: '#0A0A0A', lineHeight: 1 }}>{price}€</span>
                  </div>
                  <p className="text-sm mb-7" style={{ color: '#9CA3AF' }}>{plan.priceNote}</p>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-3">
                        <Check style={{ width: 15, height: 15, color: '#2563EB', flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={openRegister} className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: '#2563EB', border: 'none', cursor: 'pointer' }}>
                    Commencer
                  </button>
                </motion.div>
              )
            })}
          </CarouselSection>
        </div>
      </section>

      {/* ── ACCÈS ANTICIPÉ ── */}
      <section style={{ background: '#FFFFFF', padding: '80px 24px' }}>
        <div className="max-w-xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
            className="text-center rounded-[20px] p-12" style={{ background: '#EFF6FF', border: '1px solid #DBEAFE' }}>
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white uppercase mb-5" style={{ background: '#2563EB', letterSpacing: '0.08em' }}>ACCÈS ANTICIPÉ</span>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(24px,3vw,36px)', color: '#0A0A0A', letterSpacing: '-0.02em' }}>Testez Maimoo gratuitement.</h2>
            <p className="mb-8" style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.75 }}>
              Nous sélectionnons un nombre limité d'équipes pour accéder à Maimoo en avant-première. Accès prioritaire, tarif fondateur.
            </p>
            {earlyDone ? (
              <div className="flex items-center justify-center gap-3">
                <Check style={{ width: 20, height: 20, color: '#2563EB' }} />
                <p style={{ color: '#0A0A0A', fontSize: 16, fontWeight: 500 }}>Vous êtes sur la liste ! On vous contacte très vite.</p>
              </div>
            ) : (
              <form onSubmit={handleEarlyAccess} className="flex gap-3 flex-col sm:flex-row">
                <input type="email" placeholder="votre@email.com" value={earlyEmail} onChange={(e) => setEarlyEmail(e.target.value)}
                  className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ background: 'white', border: '1px solid #BFDBFE', color: '#0A0A0A' }} />
                <button type="submit" disabled={earlyLoading} className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: '#2563EB', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {earlyLoading ? 'Chargement…' : "Demander l'accès"}
                </button>
              </form>
            )}
            {earlyError && <p className="mt-3 text-sm" style={{ color: '#DC2626' }}>{earlyError}</p>}
          </motion.div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ background: '#0A0A0A', padding: '120px 24px', position: 'relative', overflow: 'hidden' }}>
        <div className="absolute inset-0" style={gridBgDark} aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto text-center">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.h2 variants={fadeInUp} className="font-bold mb-6" style={{ fontSize: 'clamp(28px,4vw,56px)', color: 'white', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Les meilleures équipes commerciales<br />ne travaillent pas plus.{' '}
              <em style={{ color: '#93C5FD', fontStyle: 'italic' }}>Elles savent plus.</em>
            </motion.h2>
            <motion.p variants={fadeInUp} style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', maxWidth: 500, margin: '0 auto 40px', lineHeight: 1.7 }}>
              Rejoignez les équipes qui ont fait de leur connaissance client un avantage concurrentiel.
            </motion.p>
            <motion.div variants={fadeInUp}>
              <button onClick={openRegister} className="font-bold transition-opacity hover:opacity-90" style={{ background: 'white', color: '#0A0A0A', borderRadius: 24, padding: '16px 36px', fontSize: 16, border: 'none', cursor: 'pointer' }}>
                Commencer gratuitement
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#0A0A0A', borderTop: '1px solid #1F2937', padding: '40px 24px' }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Image src="/logo.png" alt="Maimoo" height={24} width={90} style={{ height: 24, width: 'auto', filter: 'brightness(0) invert(1)' }} />
          <div className="flex items-center gap-6 flex-wrap justify-center">
            {[['CGU', '#'], ['Mentions légales', '/mentions-legales'], ['Confidentialité', '/confidentialite'], ['Contact', '/contact']].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: 14, color: '#6B7280', textDecoration: 'none' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'white' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6B7280' }}>{label}</a>
            ))}
          </div>
          <p style={{ fontSize: 14, color: '#6B7280' }}>© 2026 Maimoo</p>
        </div>
      </footer>
    </div>
  )
}

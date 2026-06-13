'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Mic, Search, Users } from 'lucide-react'
import { AuthModal } from '@/components/AuthModal'
import { createClient } from '@/lib/supabase/client'
import { fadeInUp, staggerContainer } from '@/lib/animations'

type ModalView = 'login' | 'register'

const gridBg: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
}

const serifItalic: React.CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontStyle: 'italic',
}

export default function LandingPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>('login')
  const [scrolled, setScrolled] = useState(false)

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
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

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
      <div className="min-h-screen" style={{ backgroundColor: '#F8F9FF' }}>
        <nav className="flex items-center px-6 py-4 bg-white sticky top-0 z-40 border-b border-[#E5E7EB]">
          <Image src="/logo.png" alt="Maimoo" height={32} width={120} style={{ height: 32, width: 'auto' }} />
        </nav>
        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-7">
            <Image src="/logo.png" alt="Maimoo" height={28} width={100} style={{ height: 28, width: 'auto', marginBottom: 24 }} />
            {!inviteReady ? (
              <p className="text-sm text-center py-4 text-[#6B7280]">
                {inviteError || 'Vérification du lien…'}
              </p>
            ) : (
              <>
                <h2 className="text-xl font-bold text-[#1E2761] mb-1">Bienvenue sur Maimoo</h2>
                <p className="text-sm text-[#6B7280] mb-5">Créez votre accès</p>
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#1A1A2E] mb-1">Prénom</label>
                      <input
                        className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4C6EF5]"
                        placeholder="Jean"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1A1A2E] mb-1">Nom</label>
                      <input
                        className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4C6EF5]"
                        placeholder="Dupont"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1A1A2E] mb-1">Mot de passe</label>
                    <input
                      type="password"
                      className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4C6EF5]"
                      placeholder="••••••••"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1A1A2E] mb-1">Confirmer</label>
                    <input
                      type="password"
                      className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4C6EF5]"
                      placeholder="••••••••"
                      value={inviteConfirm}
                      onChange={(e) => setInviteConfirm(e.target.value)}
                      required
                    />
                  </div>
                  {inviteError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{inviteError}</p>}
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: '#1E2761' }}
                  >
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
  return (
    <div className="min-h-screen bg-white overflow-x-hidden" style={{ color: '#1A1A2E' }}>
      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} defaultView={modalView} />

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] transition-shadow duration-200"
        style={scrolled ? { boxShadow: '0 2px 12px rgba(0,0,0,0.08)' } : {}}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Image src="/logo.png" alt="Maimoo" height={32} width={120} style={{ height: 32, width: 'auto' }} />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-[#6B7280] hover:text-[#1E2761] transition-colors">Fonctionnalités</a>
            <a href="#pricing" className="text-sm text-[#6B7280] hover:text-[#1E2761] transition-colors">Tarifs</a>
            <button
              onClick={openLogin}
              className="text-sm text-[#6B7280] hover:text-[#1E2761] transition-colors"
            >
              Se connecter
            </button>
            <button
              onClick={openRegister}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#1E2761' }}
            >
              Commencer gratuitement
            </button>
          </div>
          <div className="flex md:hidden items-center gap-3">
            <button onClick={openLogin} className="text-sm text-[#6B7280]">Connexion</button>
            <button
              onClick={openRegister}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: '#1E2761' }}
            >
              Démarrer
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="bg-white" style={gridBg}>
        <div className="max-w-4xl mx-auto px-6 pt-[120px] pb-[100px] text-center">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium mb-8"
            style={{ backgroundColor: '#EEF2FF', color: '#4C6EF5' }}
          >
            Knowledge management commercial
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
            className="font-black leading-tight mb-6"
            style={{
              fontSize: 'clamp(36px, 6vw, 64px)',
              color: '#1E2761',
              letterSpacing: '-0.02em',
              maxWidth: 700,
              margin: '0 auto 24px',
            }}
          >
            La mémoire de votre équipe commerciale
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
            className="mb-10"
            style={{
              fontSize: 20,
              color: '#6B7280',
              lineHeight: 1.7,
              maxWidth: 560,
              margin: '0 auto 40px',
            }}
          >
            Capturez chaque information client en 30 secondes. Retrouvez tout en 3 secondes. Depuis votre téléphone, partout.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <button
              onClick={openRegister}
              className="w-full sm:w-auto px-7 py-3.5 rounded-lg text-base font-semibold text-white transition-transform duration-150 hover:scale-[1.02]"
              style={{ backgroundColor: '#1E2761', borderRadius: 8 }}
            >
              Commencer gratuitement
            </button>
            <button
              onClick={openLogin}
              className="w-full sm:w-auto px-7 py-3.5 rounded-lg text-base font-semibold transition-transform duration-150 hover:scale-[1.02] border"
              style={{ borderColor: '#1E2761', color: '#1E2761', borderRadius: 8 }}
            >
              Se connecter
            </button>
          </motion.div>

          {/* App mockup */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.0, 0.0, 0.2, 1.0] } } }}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
            className="mx-auto overflow-hidden"
            style={{
              maxWidth: 900,
              borderRadius: 16,
              boxShadow: '0 8px 40px rgba(30,39,97,0.12)',
              backgroundColor: '#1E2761',
              minHeight: 360,
            }}
          >
            <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-white/20" />
                <span className="w-3 h-3 rounded-full bg-white/20" />
                <span className="w-3 h-3 rounded-full bg-white/20" />
              </div>
              <div className="flex-1 h-6 rounded-md bg-white/10 max-w-xs" />
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 space-y-3">
                {['Acme Corp', 'Schneider SA', 'Atelier Dupont', 'BTP Solutions'].map((n) => (
                  <div key={n} className="bg-white/10 rounded-xl px-4 py-3">
                    <div className="text-white/80 text-sm font-medium">{n}</div>
                    <div className="text-white/40 text-xs mt-1">Dernière note il y a 2j</div>
                  </div>
                ))}
              </div>
              <div className="md:col-span-2 space-y-3">
                <div className="bg-white/10 rounded-xl px-4 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-[#4C6EF5] flex items-center justify-center text-white text-xs font-bold">T</div>
                    <div>
                      <div className="text-white/80 text-xs font-medium">Thomas R.</div>
                      <div className="text-white/40 text-xs">Aujourd'hui, 14h32</div>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#4C6EF5]/30 text-[#9FB4FF]">Note vocale</span>
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed">
                    Réunion avec Jean-Marc. Budget confirmé pour Q3. Ils attendent notre devis avant le 20. Décideur final : la DG.
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Search className="w-4 h-4 text-white/40" />
                  <span className="text-white/40 text-sm">Rechercher dans toutes vos notes…</span>
                  <span className="ml-auto text-xs text-white/30">⌘K</span>
                </div>
                <div className="bg-white/10 rounded-xl px-4 py-3">
                  <div className="text-white/50 text-xs mb-2">Résultat IA</div>
                  <p className="text-white/70 text-sm">"Le contact chez Acme Corp est Jean-Marc, décideur final avec un budget confirmé pour Q3."</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── PROBLÈMES ──────────────────────────────────────────────────────── */}
      <section className="bg-white py-[100px]" style={gridBg}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <motion.p
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="text-[#4C6EF5] text-[13px] tracking-[0.1em] uppercase mb-4"
              style={serifItalic}
            >
              Vous reconnaissez-vous ?
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="font-bold"
              style={{ fontSize: 40, color: '#1E2761', letterSpacing: '-0.01em' }}
            >
              Ce que vivent vos équipes au quotidien
            </motion.h2>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                num: '01',
                title: "L'information se perd",
                desc: "Après un appel ou une visite, les infos finissent dans un carnet, un email ou nulle part. Trois semaines plus tard, plus personne ne se souvient de ce qui a été dit.",
              },
              {
                num: '02',
                title: 'Le savoir reste dans une seule tête',
                desc: "Quand un commercial part en vacances, tombe malade ou quitte l'entreprise, toute la relation client part avec lui.",
              },
              {
                num: '03',
                title: 'Le CRM ne capture pas tout',
                desc: "Il est fait pour les données formelles, pas pour les infos du quotidien. Une remarque en réunion, un document reçu, une impression après un appel : tout disparait. Et sur le terrain, personne n'ouvre son CRM entre deux rendez-vous.",
              },
            ].map(({ num, title, desc }) => (
              <motion.div
                key={num}
                variants={fadeInUp}
                className="bg-white border border-[#E5E7EB] rounded-xl p-7"
              >
                <div
                  className="font-black mb-5 select-none"
                  style={{ fontSize: 48, color: '#F0F4FF', lineHeight: 1 }}
                >
                  {num}
                </div>
                <h3 className="font-bold text-[#1E2761] mb-3" style={{ fontSize: 18 }}>{title}</h3>
                <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.7 }}>{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── BÉNÉFICES ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-[100px]" style={{ backgroundColor: '#F8F9FF' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <motion.p
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="text-[#4C6EF5] text-[13px] tracking-[0.1em] uppercase mb-4"
              style={serifItalic}
            >
              Avec Maimoo
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="font-bold"
              style={{ fontSize: 40, color: '#1E2761', letterSpacing: '-0.01em' }}
            >
              Tout reste. Tout se retrouve. Partout.
            </motion.h2>
          </div>

          <div className="space-y-20">
            {[
              {
                icon: Mic,
                title: '30 secondes après un appel',
                desc: "Note vocale, l'IA structure et classe automatiquement. Aucune saisie manuelle, depuis votre téléphone, où que vous soyez.",
                reverse: false,
              },
              {
                icon: Search,
                title: "N'importe quelle info en 3 secondes",
                desc: 'Une question en langage naturel, une réponse immédiate. Documents, notes informelles, comptes-rendus : tout est retrouvable instantanément.',
                reverse: true,
              },
              {
                icon: Users,
                title: "La mémoire complète de l'équipe",
                desc: "Maimoo ne remplace pas votre CRM, il le complète. Il capture tout ce que le CRM ne retient pas, et le rend accessible à toute l'équipe, en permanence.",
                reverse: false,
              },
            ].map(({ icon: Icon, title, desc, reverse }) => (
              <motion.div
                key={title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12`}
              >
                <div className="flex-1 flex justify-center">
                  <div
                    className="w-24 h-24 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: '#EEF2FF' }}
                  >
                    <Icon style={{ width: 32, height: 32, color: '#4C6EF5' }} />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold mb-4" style={{ fontSize: 24, color: '#1E2761' }}>{title}</h3>
                  <p style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.7 }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TÉMOIGNAGES ────────────────────────────────────────────────────── */}
      <section className="bg-white py-[100px]" style={gridBg}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <motion.p
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="text-[#4C6EF5] text-[13px] tracking-[0.1em] uppercase mb-4"
              style={serifItalic}
            >
              Ils nous font confiance
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="font-bold"
              style={{ fontSize: 40, color: '#1E2761', letterSpacing: '-0.01em' }}
            >
              Des équipes qui n'oublient plus rien
            </motion.h2>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                quote: "Avant Maimoo, chaque départ de commercial était une catastrophe. Aujourd'hui toute la relation client reste dans l'équipe.",
                name: 'Sophie M.',
                role: 'Directrice Commerciale, PME industrielle',
                initials: 'SM',
              },
              {
                quote: "Je dicte mes notes en sortant du rendez-vous. En 30 secondes c'est classé, structuré, accessible à toute l'équipe.",
                name: 'Thomas R.',
                role: 'Commercial terrain, secteur BTP',
                initials: 'TR',
              },
              {
                quote: "Notre CRM on l'adore mais il ne capturait pas les infos informelles. Maimoo comble exactement ce manque.",
                name: 'Pierre L.',
                role: 'Directeur des ventes, distribution',
                initials: 'PL',
              },
            ].map(({ quote, name, role, initials }) => (
              <motion.div
                key={name}
                variants={fadeInUp}
                className="bg-white border border-[#E5E7EB] rounded-xl p-7 flex flex-col"
              >
                <div
                  className="font-black mb-4 select-none leading-none"
                  style={{ fontSize: 48, color: '#EEF2FF' }}
                >
                  &ldquo;
                </div>
                <p className="flex-1 text-[#1A1A2E] mb-6" style={{ fontSize: 15, lineHeight: 1.7, fontStyle: 'italic' }}>
                  {quote}
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: '#1E2761' }}
                  >
                    {initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#1A1A2E]">{name}</div>
                    <div className="text-xs text-[#6B7280]">{role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-[100px] text-center" style={{ backgroundColor: '#1E2761' }}>
        <div className="max-w-3xl mx-auto px-6">
          <motion.h2
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="font-extrabold text-white mb-6"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)', letterSpacing: '-0.02em' }}
          >
            Prêt à ne plus jamais perdre une information client ?
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-10"
            style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}
          >
            Créez votre espace gratuitement en 2 minutes.
          </motion.p>
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <button
              onClick={openRegister}
              className="px-8 py-4 rounded-lg text-base font-bold text-[#1E2761] bg-white transition-transform duration-150 hover:scale-[1.02]"
            >
              Commencer gratuitement
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-[#E5E7EB] px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="Maimoo" height={24} width={90} style={{ height: 24, width: 'auto' }} />
            <span style={{ fontSize: 13, color: '#6B7280' }}>© 2026 Maimoo</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/mentions-legales" style={{ fontSize: 13, color: '#6B7280' }} className="hover:text-[#1E2761] transition-colors">
              Mentions légales
            </Link>
            <Link href="/confidentialite" style={{ fontSize: 13, color: '#6B7280' }} className="hover:text-[#1E2761] transition-colors">
              Confidentialité
            </Link>
            <Link href="/contact" style={{ fontSize: 13, color: '#6B7280' }} className="hover:text-[#1E2761] transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

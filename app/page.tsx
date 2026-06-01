'use client'

import { useState } from 'react'
import { ArrowRight, Mic, FileText, Search, Zap, Shield, Users } from 'lucide-react'
import { AuthModal } from '@/components/AuthModal'

type ModalView = 'login' | 'register'

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>('login')

  const openLogin = () => { setModalView('login'); setModalOpen(true) }
  const openRegister = () => { setModalView('register'); setModalOpen(true) }

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
      <footer className="border-t border-slate-100 bg-white px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-bold text-xs"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
            M
          </div>
          <span className="font-bold text-[#1E2761]">Maimoo</span>
        </div>
        <p className="text-xs text-[#94A3B8]">© 2026 Maimoo. Tous droits réservés.</p>
      </footer>
    </div>
  )
}

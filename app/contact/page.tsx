'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 text-[#0F172A] text-[16px] md:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all bg-white"
const labelClass = "block text-sm font-medium text-[#334155] mb-1.5"

export default function ContactPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!firstName.trim()) { setError('Veuillez entrer votre prénom.'); return }
    if (!lastName.trim()) { setError('Veuillez entrer votre nom.'); return }
    if (!email.trim()) { setError('Veuillez entrer votre email.'); return }
    if (!company.trim()) { setError("Veuillez entrer le nom de votre entreprise."); return }

    setLoading(true)
    const supabase = createClient()
    const { error: dbError } = await supabase.from('demo_requests').insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      company: company.trim(),
      team_size: teamSize || null,
      message: message.trim() || null,
    })

    if (dbError) {
      setError("Une erreur est survenue. Réessayez ou écrivez-nous à contact@maimoo.fr")
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen" style={{ background: '#FFFFFF', backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      {/* Header */}
      <header className="border-b border-slate-100 bg-white px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <Image src="/logo.png" alt="Maimoo" height={28} width={104} style={{ height: 28, width: 'auto' }} />
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0A0A0A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Accueil
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-6 py-12">
        {sent ? (
          <div className="flex flex-col items-center text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: '#DBEAFE' }}>
              <Check className="w-8 h-8" style={{ color: '#2563EB' }} />
            </div>
            <h2 className="text-2xl font-bold text-[#0F172A] mb-3">Merci !</h2>
            <p className="text-[#64748B] mb-8 leading-relaxed">
              Nous vous recontactons sous 24h pour vous présenter Maimoo et répondre à vos questions.
            </p>
            <Link href="/" className="text-sm font-medium text-[#2563EB] hover:underline">
              Retour à l&apos;accueil
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-10">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase mb-4" style={{ background: '#DBEAFE', color: '#2563EB', letterSpacing: '0.08em' }}>Démo gratuite</span>
              <h1 className="text-3xl font-black text-[#0F172A] mb-3" style={{ letterSpacing: '-0.02em' }}>Demandez une démo</h1>
              <p className="text-[#64748B] leading-relaxed">
                Notre équipe vous contacte sous 24h pour vous présenter Maimoo et répondre à vos questions.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="d-first">Prénom</label>
                  <input
                    id="d-first"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jean"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="d-last">Nom</label>
                  <input
                    id="d-last"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Dupont"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="d-email">Email professionnel</label>
                <input
                  id="d-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onInvalid={(e) => e.preventDefault()}
                  placeholder="jean@entreprise.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="d-company">Nom de l&apos;entreprise</label>
                <input
                  id="d-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme SAS"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="d-size">Taille de l&apos;équipe commerciale</label>
                <select
                  id="d-size"
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className={inputClass}
                  style={{ appearance: 'none' }}
                >
                  <option value="">Sélectionner...</option>
                  <option value="1-5">1 à 5 commerciaux</option>
                  <option value="6-20">6 à 20 commerciaux</option>
                  <option value="21-50">21 à 50 commerciaux</option>
                  <option value="50+">Plus de 50 commerciaux</option>
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="d-message">Message <span className="text-slate-400 font-normal">(optionnel)</span></label>
                <textarea
                  id="d-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Décrivez votre contexte, vos questions..."
                  className={inputClass}
                  style={{ resize: 'none' }}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: '#2563EB', border: 'none', cursor: loading ? 'default' : 'pointer' }}
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                {loading ? 'Envoi...' : 'Envoyer ma demande'}
              </button>

              <p className="text-xs text-center text-slate-400">
                En soumettant ce formulaire, vous acceptez d&apos;être recontacté par notre équipe.
              </p>
            </form>
          </>
        )}
      </main>

      <footer className="border-t border-slate-100 bg-white px-6 py-6 text-center mt-12">
        <p className="text-xs text-[#94A3B8]">© 2026 Maimoo. Tous droits réservés.</p>
      </footer>
    </div>
  )
}

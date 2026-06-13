'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, Check } from 'lucide-react'
import { FormMessage } from '@/components/ui/FormMessage'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Veuillez entrer votre nom.'); return }
    if (!email.trim()) { setError('Veuillez entrer votre email.'); return }
    if (!message.trim()) { setError('Veuillez écrire votre message.'); return }
    setLoading(true)
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message }),
    })
    if (res.ok) {
      setSent(true)
    } else {
      const data = await res.json()
      setError(data.error ?? "Une erreur est survenue.")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-100 px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
          >
            M
          </div>
          <span className="font-bold text-[#1E2761]">Maimoo</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#1E2761] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Accueil
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-[#0F172A] mb-2">Contact</h1>
        <p className="text-[#64748B] mb-10">
          Une question, une suggestion ? Écrivez-nous, nous vous répondrons rapidement.
        </p>

        {sent ? (
          <div className="flex flex-col items-center text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-[#0F172A] mb-2">Message envoyé !</h2>
            <p className="text-[#64748B] mb-6">
              Nous avons bien reçu votre message et vous répondrons sous 48h.
            </p>
            <Link
              href="/"
              className="text-sm font-medium text-[#3B5BDB] hover:underline"
            >
              Retour à l&apos;accueil
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5" htmlFor="c-name">
                Nom complet
              </label>
              <input
                id="c-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[#0F172A] text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/30 focus:border-[#3B5BDB] transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5" htmlFor="c-email">
                Email
              </label>
              <input
                id="c-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInvalid={(e) => e.preventDefault()}
                placeholder="vous@exemple.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[#0F172A] text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/30 focus:border-[#3B5BDB] transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5" htmlFor="c-message">
                Message
              </label>
              <textarea
                id="c-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Votre message..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[#0F172A] text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/30 focus:border-[#3B5BDB] transition-all resize-none"
              />
            </div>

            {error && <FormMessage type="error" message={error} />}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {loading ? 'Envoi...' : 'Envoyer le message'}
            </button>
          </form>
        )}

        <div className="mt-10 pt-8 border-t border-slate-100 text-sm text-[#64748B]">
          <p>Ou contactez-nous directement par email :</p>
          <a href="mailto:contact@maimoo.fr" className="text-[#3B5BDB] font-medium hover:underline">
            contact@maimoo.fr
          </a>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6 text-center">
        <p className="text-xs text-[#94A3B8]">© 2026 Maimoo. Tous droits réservés.</p>
      </footer>
    </div>
  )
}

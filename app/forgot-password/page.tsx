'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    setSent(true)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: '#F8FAFC' }}
    >
      <div
        className="w-full bg-white"
        style={{
          maxWidth: 400,
          borderRadius: 16,
          border: '1px solid #E5E7EB',
          padding: 40,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="Maimoo" width={120} height={32} style={{ height: 32, width: 'auto' }} />
        </div>

        {sent ? (
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: '#EFF6FF' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#0F172A] mb-2">Email envoyé</h1>
            <p className="text-sm text-[#64748B] leading-relaxed mb-6">
              Si un compte existe avec cet email, vous recevrez un lien dans quelques minutes. Pensez à vérifier vos spams.
            </p>
            <Link
              href="/"
              className="text-sm font-medium"
              style={{ color: '#2563EB' }}
            >
              ← Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-[#0F172A] mb-1 text-center">Mot de passe oublié</h1>
            <p className="text-sm text-[#64748B] text-center mb-6 leading-relaxed">
              Entrez votre adresse email et nous vous enverrons un lien de réinitialisation.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  fontSize: 14,
                  color: '#0F172A',
                  background: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#2563EB' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E5E7EB' }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: 48,
                  background: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {loading ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>

            <div className="mt-5 text-center">
              <Link
                href="/"
                className="text-sm"
                style={{ color: '#64748B' }}
              >
                ← Retour à la connexion
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

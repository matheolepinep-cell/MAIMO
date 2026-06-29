'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isPasswordValid } from '@/lib/password-validation'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [userName, setUserName] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  // True when we actually signed out an existing session before setting the invite session
  const [hadPreviousSession, setHadPreviousSession] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const handleInvite = async () => {
      // Step 1 — sign out any existing session so we don't inherit the inviter's account
      const { data: existing } = await supabase.auth.getSession()
      if (existing.session) {
        setHadPreviousSession(true)
        await supabase.auth.signOut()
      }

      // Step 2 — parse the URL hash produced by Supabase invite emails
      const hash = window.location.hash.substring(1)
      if (!hash) {
        setError("Lien d'invitation invalide ou manquant.")
        return
      }
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token') ?? ''
      const type = params.get('type')

      if (!accessToken || type !== 'invite') {
        setError("Ce lien n'est pas un lien d'invitation valide.")
        return
      }

      // Step 3 — establish the invited user's session with their token
      const { data, error: sessionErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionErr || !data.session) {
        setError("Lien d'invitation invalide ou expiré. Demandez un nouvel envoi.")
        return
      }

      // Step 4 — expose the invited user's name
      const user = data.session.user
      const name = user.user_metadata?.full_name ?? user.email ?? ''
      setUserName(name.split(' ')[0])
      setAuthReady(true)
    }

    handleInvite()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!isPasswordValid(password)) {
      setError('Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    // Mark password as set and activate the invited user
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('users').update({ has_set_password: true, is_active: true }).eq('id', user.id)
    }

    setDone(true)
    setTimeout(() => router.push('/app/dashboard'), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#F8FAFC' }}>
      <div className="mb-10">
        <Image src="/logo.png" alt="Maimoo" width={120} height={32} />
      </div>

      <div
        className="w-full max-w-sm rounded-3xl p-8 bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
      >
        {done ? (
          <div className="flex flex-col items-center text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <h1 className="text-lg font-semibold text-[#0F172A] mb-2">Mot de passe défini !</h1>
            <p className="text-sm text-[#94A3B8]">Redirection vers l'application…</p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-[#0F172A] mb-1">
              {userName ? `Bienvenue, ${userName} !` : 'Bienvenue sur Maimoo'}
            </h1>
            <p className="text-sm text-[#94A3B8] mb-4">
              Choisissez un mot de passe pour accéder à votre compte.
            </p>

            {/* Inform the user that a previous session was cleared */}
            {hadPreviousSession && (
              <div
                className="mb-4 px-3 py-2.5 rounded-xl text-xs text-[#92400E] leading-relaxed"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
              >
                Vous allez créer votre compte. Toute session précédente a été déconnectée sur ce navigateur.
              </div>
            )}

            {!authReady && !error && (
              <div className="flex items-center gap-2 py-4 mb-4 text-sm text-[#64748B]">
                <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                Vérification du lien en cours…
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Mot de passe</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="Minimum 8 caractères"
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={!authReady}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthIndicator password={password} focused={passwordFocused} />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Confirmer le mot de passe</label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={!authReady}
                />
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas.</p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !authReady || !isPasswordValid(password) || password !== confirm}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50"
                style={{ background: '#2563EB' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enregistrement…
                  </span>
                ) : (
                  'Définir mon mot de passe'
                )}
              </button>
            </form>
          </>
        )}
      </div>
      <p className="mt-8 text-xs text-[#94A3B8]">© 2026 Maimoo</p>
    </div>
  )
}

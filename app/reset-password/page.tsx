'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isPasswordValid } from '@/lib/password-validation'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    if (!hash) return
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    if (!accessToken) return
    const supabase = createClient()
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: params.get('refresh_token') ?? '',
    }).then(({ error: err }) => {
      if (!err) setSessionReady(true)
    })
  }, [])

  // Also handle the case where Supabase sets the session automatically
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })
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
    setDone(true)
    setTimeout(() => router.push('/app/dashboard'), 2000)
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

        {done ? (
          <div className="flex flex-col items-center text-center gap-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <h1 className="text-xl font-bold text-[#0F172A]">Mot de passe mis à jour !</h1>
            <p className="text-sm text-[#64748B]">Redirection vers l'application…</p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-[#0F172A] mb-1 text-center">Nouveau mot de passe</h1>
            <p className="text-sm text-[#64748B] text-center mb-6">
              Choisissez un nouveau mot de passe sécurisé.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="Minimum 8 caractères"
                    required
                    style={{
                      width: '100%',
                      height: 48,
                      padding: '0 42px 0 14px',
                      borderRadius: 10,
                      border: '1px solid #E5E7EB',
                      fontSize: 14,
                      color: '#0F172A',
                      background: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
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

              {/* Confirm */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Confirmer le mot de passe
                </label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe"
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
                disabled={loading || !isPasswordValid(password) || password !== confirm || !sessionReady}
                style={{
                  width: '100%',
                  height: 48,
                  background: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: (loading || !isPasswordValid(password) || password !== confirm || !sessionReady) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {loading ? 'Réinitialisation…' : 'Réinitialiser'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

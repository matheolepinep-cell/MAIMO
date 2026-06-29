'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isPasswordValid } from '@/lib/password-validation'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormMessage } from '@/components/ui/FormMessage'

function RegisterContent() {
  const router = useRouter()
  const [phase, setPhase] = useState<'form' | 'confirm'>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [phone, setPhone] = useState('')
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const [consentCgu, setConsentCgu] = useState(false)
  const [consentPrivacy, setConsentPrivacy] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [consentCguError, setConsentCguError] = useState(false)
  const [consentPrivacyError, setConsentPrivacyError] = useState(false)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setConsentCguError(false)
    setConsentPrivacyError(false)
    if (!fullName.trim() || !email.trim() || !password || !companyName.trim()) { setError('Veuillez remplir tous les champs.'); return }
    if (!isPasswordValid(password)) { setError('Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre.'); return }
    let hasConsentError = false
    if (!consentCgu) { setConsentCguError(true); hasConsentError = true }
    if (!consentPrivacy) { setConsentPrivacyError(true); hasConsentError = true }
    if (hasConsentError) return
    setLoading(true)
    const supabase = createClient()

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (signUpError || !authData.user) {
      setError(signUpError?.message ?? 'Erreur lors de la création du compte.')
      setLoading(false)
      return
    }

    // Company + user creation via server-side API (service role bypasses RLS,
    // works even when there is no active session after signUp)
    const setupRes = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authData.user.id,
        email,
        fullName,
        companyName,
        phone,
        consentMarketing,
      }),
    })

    if (!setupRes.ok) {
      const { error: setupErr } = await setupRes.json().catch(() => ({}))
      setError(setupErr ?? "Erreur lors de la création de l'espace.")
      setLoading(false)
      return
    }

    setLoading(false)
    setPhase('confirm')
  }

  const handleResend = async () => {
    setResendLoading(true)
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResendCooldown(60)
    setResendLoading(false)
  }

  if (phase === 'confirm') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: '#0A0A0A' }}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-[#0A0A0A] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <h1 className="text-2xl font-bold tracking-widest text-[#0A0A0A]">MAIMOO</h1>
          </div>

          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.06)' }}>
              <MailCheck className="w-8 h-8" style={{ color: '#0A0A0A' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0F172A] mb-2">Vérifiez votre boîte mail</h2>
              <p className="text-sm text-[#64748B] leading-relaxed">
                Un email de confirmation a été envoyé à{' '}
                <span className="font-medium text-[#1E293B]">{email}</span>.
                Cliquez sur le lien dans l&apos;email pour activer votre compte.
              </p>
            </div>
            <p className="text-xs text-[#94A3B8]">
              Pensez à vérifier vos spams si vous ne voyez pas l&apos;email.
            </p>
            <button
              onClick={handleResend}
              disabled={resendLoading || resendCooldown > 0}
              className="w-full py-2.5 px-4 rounded-xl border text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: resendCooldown > 0 ? '#E2E8F0' : '#CBD5E1',
                color: resendCooldown > 0 ? '#94A3B8' : '#64748B',
              }}
            >
              {resendLoading ? 'Envoi…' : resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : 'Renvoyer l\'email'}
            </button>
            <button
              onClick={() => {
                setPhase('form')
                setEmail('')
                setPassword('')
                setFullName('')
                setCompanyName('')
                setResendCooldown(0)
              }}
              className="text-sm text-[#94A3B8] hover:text-[#64748B] transition-colors"
            >
              Utiliser une autre adresse
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0A0A0A' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#0A0A0A] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-[#0A0A0A]">MAIMOO</h1>
          <p className="text-[#64748B] text-sm mt-1">Créez votre espace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="fullName" label="Nom complet" placeholder="Jean Dupont"
            value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input id="email" type="email" label="Email" placeholder="vous@exemple.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            onInvalid={(e) => e.preventDefault()} autoComplete="email" />
          <Input id="phone" type="tel" label="Téléphone (optionnel)" placeholder="+33 6 12 34 56 78"
            value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <div>
            <Input id="password" type="password" label="Mot de passe" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
              onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)} />
            <PasswordStrengthIndicator password={password} focused={passwordFocused} />
          </div>
          <Input id="companyName" label="Nom de votre espace" placeholder="Mon espace"
            value={companyName} onChange={(e) => setCompanyName(e.target.value)} />

          {/* Consent checkboxes */}
          <div className="space-y-3">
            <div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentCgu}
                  onChange={(e) => { setConsentCgu(e.target.checked); if (e.target.checked) setConsentCguError(false) }}
                  className="mt-0.5 w-4 h-4 shrink-0 rounded"
                  style={{ accentColor: '#2563EB' }}
                />
                <span className="text-[13px] text-[#374151] leading-snug">
                  J&apos;accepte les{' '}
                  <a href="/cgu" target="_blank" rel="noopener noreferrer" className="text-[#2563EB] underline">
                    Conditions Générales d&apos;Utilisation
                  </a>
                </span>
              </label>
              {consentCguError && (
                <p className="mt-1 text-[12px] text-[#DC2626] ml-[26px]">Vous devez accepter les CGU pour continuer.</p>
              )}
            </div>
            <div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentPrivacy}
                  onChange={(e) => { setConsentPrivacy(e.target.checked); if (e.target.checked) setConsentPrivacyError(false) }}
                  className="mt-0.5 w-4 h-4 shrink-0 rounded"
                  style={{ accentColor: '#2563EB' }}
                />
                <span className="text-[13px] text-[#374151] leading-snug">
                  J&apos;ai lu et j&apos;accepte la{' '}
                  <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="text-[#2563EB] underline">
                    Politique de confidentialité
                  </a>
                </span>
              </label>
              {consentPrivacyError && (
                <p className="mt-1 text-[12px] text-[#DC2626] ml-[26px]">Vous devez accepter la politique de confidentialité.</p>
              )}
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consentMarketing}
                onChange={(e) => setConsentMarketing(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 rounded"
                style={{ accentColor: '#2563EB' }}
              />
              <span className="text-[13px] text-[#374151] leading-snug">
                J&apos;accepte de recevoir des informations et nouveautés de Maimoo
              </span>
            </label>
          </div>

          {error && <FormMessage type="error" message={error} />}

          <Button type="submit" loading={loading} disabled={loading || (password.length > 0 && !isPasswordValid(password))} className="w-full" size="lg">
            Créer mon espace
          </Button>
        </form>

        <p className="text-center text-sm text-[#64748B] mt-6">
          Déjà un compte ?{' '}
          <Link href="/" className="text-[#3B82F6] font-medium hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  )
}

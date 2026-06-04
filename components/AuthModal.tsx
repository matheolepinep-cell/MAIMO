'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type View = 'login' | 'register'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultView?: View
}

export function AuthModal({ open, onClose, defaultView = 'login' }: AuthModalProps) {
  const router = useRouter()
  const [view, setView] = useState<View>(defaultView)

  // Login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Register
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setView(defaultView)
      setLoginError('')
      setRegisterError('')
    }
  }, [open, defaultView])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) {
      setLoginError('Email ou mot de passe incorrect.')
      setLoginLoading(false)
      return
    }
    router.push('/app/dashboard')
    router.refresh()
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError('')
    setRegisterLoading(true)
    const supabase = createClient()

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    if (signUpError || !authData.user) {
      setRegisterError(signUpError?.message ?? 'Erreur lors de la création du compte.')
      setRegisterLoading(false)
      return
    }
    const { data: company, error: companyError } = await supabase
      .from('companies').insert({ name: companyName.trim() }).select().single()
    if (companyError || !company) {
      setRegisterError("Erreur lors de la création de l'espace.")
      setRegisterLoading(false)
      return
    }
    const { error: userError } = await supabase.from('users').insert({
      id: authData.user.id, email, full_name: fullName.trim(),
      role: 'admin', company_id: company.id, is_active: true,
    })
    if (userError) {
      setRegisterError('Compte créé mais profil incomplet : ' + userError.message)
      setRegisterLoading(false)
      return
    }
    router.push('/app/dashboard')
    router.refresh()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(10,16,35,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
          >
            M
          </div>
          <span className="font-bold text-[#1E2761] text-lg">Maimoo</span>
        </div>

        {view === 'login' ? (
          <>
            <h2 className="text-xl font-bold text-[#0F172A] mb-5">Se connecter</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input id="m-email" type="email" label="Email" placeholder="vous@exemple.com"
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required autoComplete="email" />
              <Input id="m-pass" type="password" label="Mot de passe" placeholder="••••••••"
                value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required autoComplete="current-password" />
              {loginError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{loginError}</p>}
              <Button type="submit" loading={loginLoading} className="w-full" size="lg">
                Se connecter
              </Button>
            </form>
            <div className="mt-5">
              <button
                onClick={() => setView('register')}
                className="w-full py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium text-[#1E293B] hover:bg-gray-50 transition-all"
              >
                Créer un espace
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-[#0F172A] mb-4">Créer un compte</h2>
            <form onSubmit={handleRegister} className="space-y-3">
              <Input id="r-name" label="Nom complet" placeholder="Jean Dupont"
                value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <Input id="r-email" type="email" label="Email" placeholder="vous@exemple.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <Input id="r-pass" type="password" label="Mot de passe" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              <Input id="r-company" label="Nom de votre espace" placeholder="Mon équipe"
                value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              {registerError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{registerError}</p>}
              <Button type="submit" loading={registerLoading} className="w-full" size="lg">
                Créer mon espace
              </Button>
            </form>
            <p className="text-center text-sm text-[#64748B] mt-4">
              Déjà un compte ?{' '}
              <button onClick={() => setView('login')} className="text-[#3B82F6] font-medium hover:underline">
                Se connecter
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

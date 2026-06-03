'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function RegisterContent() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdCode, setCreatedCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const code = generateInviteCode()

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

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName.trim(), invite_code: code })
      .select()
      .single()

    if (companyError || !company) {
      setError("Erreur lors de la création de l'espace.")
      setLoading(false)
      return
    }

    const { error: userError } = await supabase.from('users').insert({
      id: authData.user.id,
      email,
      full_name: fullName.trim(),
      role: 'admin',
      company_id: company.id,
      is_active: true,
    })

    if (userError) {
      setError('Compte créé mais profil incomplet : ' + userError.message)
      setLoading(false)
      return
    }

    setCreatedCode(code)
    setLoading(false)
  }

  const copyCode = () => {
    navigator.clipboard.writeText(createdCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  if (createdCode) {
    return (
      <div className="min-h-screen bg-[#1E2761] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#1E293B] mb-2">Votre espace est créé !</h1>
          <p className="text-[#64748B] text-sm mb-6">
            Partagez ce code à vos collaborateurs pour qu'ils rejoignent votre espace.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-4 mb-4">
            <p className="text-xs text-[#94A3B8] mb-1">Code d'invitation</p>
            <p className="text-3xl font-bold tracking-[0.3em] font-mono text-[#1E2761]">{createdCode}</p>
          </div>

          <button
            onClick={copyCode}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border font-medium text-sm mb-4 transition-all duration-150 ${
              codeCopied
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-[#1E293B] hover:border-gray-300'
            }`}
          >
            {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {codeCopied ? 'Copié !' : 'Copier le code'}
          </button>

          <Button onClick={() => { router.push('/app/dashboard'); router.refresh() }} className="w-full" size="lg">
            Accéder à l'application
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1E2761] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#1E2761] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-[#1E2761]">MAIMOO</h1>
          <p className="text-[#64748B] text-sm mt-1">Créez votre espace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="fullName" label="Nom complet" placeholder="Jean Dupont"
            value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input id="email" type="email" label="Email" placeholder="vous@exemple.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input id="password" type="password" label="Mot de passe" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          <Input id="companyName" label="Nom de votre espace" placeholder="Mon espace"
            value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <Button type="submit" loading={loading} className="w-full" size="lg">
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

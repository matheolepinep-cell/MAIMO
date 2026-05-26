'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function RegisterPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'admin' | 'commercial'>('admin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()

    if (mode === 'admin') {
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
        setError('Erreur lors de la création de l\'espace.')
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

      router.push('/app/dashboard')
      router.refresh()
    } else {
      const { data: companyData, error: codeError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()

      if (codeError || !companyData) {
        setError('Code d\'invitation invalide.')
        setLoading(false)
        return
      }

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

      const { error: userError } = await supabase.from('users').insert({
        id: authData.user.id,
        email,
        full_name: fullName.trim(),
        role: 'commercial',
        company_id: companyData.id,
        is_active: true,
      })

      if (userError) {
        setError('Compte créé mais profil incomplet : ' + userError.message)
        setLoading(false)
        return
      }

      router.push('/app/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#1E2761] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#1E2761] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1E293B]">MemoBTP</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
          <button
            onClick={() => setMode('admin')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              mode === 'admin' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'
            }`}
          >
            Créer un espace
          </button>
          <button
            onClick={() => setMode('commercial')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              mode === 'commercial' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-[#64748B]'
            }`}
          >
            Rejoindre
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="fullName" label="Nom complet" placeholder="Jean Dupont"
            value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input id="email" type="email" label="Email" placeholder="vous@exemple.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input id="password" type="password" label="Mot de passe" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />

          {mode === 'admin' ? (
            <Input id="companyName" label="Nom de votre négoce" placeholder="Négoce Martin"
              value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          ) : (
            <Input id="inviteCode" label="Code d'invitation (6 caractères)" placeholder="ABC123"
              value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              required maxLength={6} className="uppercase tracking-widest font-mono" />
          )}

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            {mode === 'admin' ? 'Créer mon espace' : 'Rejoindre l\'espace'}
          </Button>
        </form>

        <p className="text-center text-sm text-[#64748B] mt-6">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-[#3B82F6] font-medium hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}

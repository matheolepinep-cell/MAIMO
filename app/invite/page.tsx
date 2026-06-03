'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function InvitePage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const meta = session.user?.user_metadata
        if (meta?.full_name) {
          const parts = (meta.full_name as string).trim().split(' ')
          setFirstName(parts[0] ?? '')
          setLastName(parts.slice(1).join(' ') ?? '')
        }
        setReady(true)
      } else {
        setError('Lien invalide ou expiré. Demandez une nouvelle invitation.')
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim()) { setError('Le prénom est requis.'); return }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    setError('')
    setLoading(true)

    const supabase = createClient()
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

    const { error: pwError } = await supabase.auth.updateUser({ password, data: { full_name: fullName } })
    if (pwError) { setError(pwError.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single()
      if (profile) {
        await supabase.from('users').update({ full_name: fullName, is_active: true }).eq('id', user.id)
      } else {
        const meta = user.user_metadata
        await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: meta?.role ?? 'commercial',
          company_id: meta?.company_id ?? null,
          is_active: true,
        })
      }
    }

    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#1E2761] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#1E2761] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1E293B]">Bienvenue sur <span className="tracking-widest text-[#1E2761]">MAIMOO</span></h1>
          <p className="text-[#64748B] text-sm mt-1">Créez votre accès</p>
        </div>

        {!ready ? (
          <p className="text-sm text-center text-[#64748B]">{error || 'Vérification du lien…'}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input id="firstName" label="Prénom" placeholder="Jean"
                value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              <Input id="lastName" label="Nom" placeholder="Dupont"
                value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input id="password" type="password" label="Mot de passe" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <Input id="confirm" type="password" label="Confirmer le mot de passe" placeholder="••••••••"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Accéder à l'application
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

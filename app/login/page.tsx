'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
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
          <h1 className="text-2xl font-bold tracking-widest text-[#1E2761]">MAIMO</h1>
          <p className="text-[#64748B] text-sm mt-1">La mémoire de ta force de vente</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="email" type="email" label="Email" placeholder="vous@exemple.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input id="password" type="password" label="Mot de passe" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Se connecter
          </Button>
        </form>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link
            href="/register?mode=create"
            className="flex items-center justify-center py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium text-[#1E293B] hover:bg-gray-50 transition-all duration-150 text-center"
          >
            Créer un espace
          </Link>
          <Link
            href="/register?mode=join"
            className="flex items-center justify-center py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium text-[#1E293B] hover:bg-gray-50 transition-all duration-150 text-center"
          >
            Rejoindre un espace
          </Link>
        </div>
      </div>
    </div>
  )
}

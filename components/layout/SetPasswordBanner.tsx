'use client'

import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'

export function SetPasswordBanner() {
  const { profile, loading } = useUser()
  const router = useRouter()

  if (loading || !profile || profile.has_set_password !== false) return null

  return (
    <div
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium"
      style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', color: '#92400E' }}
    >
      <KeyRound className="w-4 h-4 shrink-0" />
      <span>Définissez votre mot de passe pour pouvoir vous reconnecter.</span>
      <button
        onClick={() => router.push('/set-password')}
        className="underline underline-offset-2 font-semibold hover:opacity-75 transition-opacity"
      >
        Cliquer ici
      </button>
    </div>
  )
}

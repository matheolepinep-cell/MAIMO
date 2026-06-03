'use client'

import { useRouter } from 'next/navigation'
import { LogOut, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Header } from '@/components/layout/Header'

export default function ProfilePage() {
  const router = useRouter()
  const { profile } = useUser()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div>
      <Header title="Profil" />
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Profil</h1>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#1E2761] rounded-2xl flex items-center justify-center">
              <User className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="font-semibold text-[#1E293B]">{profile?.full_name}</p>
              <p className="text-sm text-[#64748B]">{profile?.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#1E2761]/10 text-[#1E2761]">
                {profile?.role === 'admin' ? 'Administrateur' : 'Collaborateur'}
              </span>
            </div>
          </div>
        </Card>

        <Button variant="danger" onClick={handleLogout} className="w-full" size="lg">
          <LogOut className="w-4 h-4 mr-2" />
          Se déconnecter
        </Button>
      </div>
    </div>
  )
}

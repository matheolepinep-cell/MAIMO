'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const router = useRouter()
  const { profile } = useUser()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-[#1E2761] rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">M</span>
        </div>
        <span className="font-semibold text-[#1E293B]">{title || 'MemoBTP'}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#64748B] hidden sm:block">{profile?.full_name}</span>
        <button
          onClick={handleLogout}
          className="p-2 rounded-xl text-[#64748B] hover:text-[#1E293B] hover:bg-gray-100 transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}

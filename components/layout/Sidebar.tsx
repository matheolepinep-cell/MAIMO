'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Building2, Briefcase, Search, Users, Settings, LogOut } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'

const navItems = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/app/accounts', icon: Building2, label: 'Entreprises' },
  { href: '/app/portfolio', icon: Briefcase, label: 'Portefeuille' },
  { href: '/app/search', icon: Search, label: 'Recherche IA' },
  { href: '/app/team', icon: Users, label: 'Équipe' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useUser()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[#1E2761] min-h-screen">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">M</span>
          </div>
          <span className="text-white font-bold text-lg">MemoBTP</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              pathname.startsWith(href)
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        {profile?.role === 'admin' && (
          <Link
            href="/app/settings"
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              pathname.startsWith('/app/settings')
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <Settings className="w-5 h-5" />
            Paramètres
          </Link>
        )}
        <div className="px-3 py-2">
          <p className="text-white text-sm font-medium truncate">{profile?.full_name}</p>
          <p className="text-white/50 text-xs truncate">{profile?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150"
        >
          <LogOut className="w-5 h-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

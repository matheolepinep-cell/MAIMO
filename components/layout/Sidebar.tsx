'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Briefcase, Building2, Users, Settings, LogOut, User } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'

const navItems = [
  { href: '/app/search', icon: Search, label: 'Recherche IA' },
  { href: '/app/portfolio', icon: Briefcase, label: 'Mon portefeuille' },
  { href: '/app/accounts', icon: Building2, label: 'Entreprises' },
  { href: '/app/team', icon: Users, label: 'Équipe' },
]

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        'relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
        active ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'
      )}
      title={label}
    >
      <Icon className="w-5 h-5" />
      <span className="pointer-events-none absolute left-12 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 shadow-lg">
        {label}
      </span>
    </Link>
  )
}

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

  const initials = profile?.full_name
    ?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? '?'

  return (
    <aside className="hidden md:flex flex-col items-center w-16 bg-[#1E2761] min-h-screen py-4 shrink-0 overflow-visible">
      {/* Logo */}
      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-6 shrink-0">
        <span className="text-white font-bold text-base">M</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map(({ href, icon, label }) => (
          <NavItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            active={pathname.startsWith(href) || (href === '/app/search' && pathname.startsWith('/app/dashboard'))}
          />
        ))}
      </nav>

      {/* Bottom: settings + user avatar */}
      <div className="flex flex-col items-center gap-2 mt-auto">
        {profile?.role === 'admin' && (
          <NavItem
            href="/app/settings"
            icon={Settings}
            label="Paramètres"
            active={pathname.startsWith('/app/settings')}
          />
        )}

        <Link
          href="/app/profile"
          className={clsx(
            'relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
            pathname.startsWith('/app/profile') ? 'bg-white/20' : 'hover:bg-white/10'
          )}
          title={profile?.full_name ?? 'Profil'}
        >
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            {initials !== '?'
              ? <span className="text-white text-xs font-semibold">{initials}</span>
              : <User className="w-4 h-4 text-white/70" />
            }
          </div>
          <span className="pointer-events-none absolute left-12 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 shadow-lg">
            {profile?.full_name ?? 'Profil'}
          </span>
        </Link>

        <button
          onClick={handleLogout}
          className="relative group flex items-center justify-center w-10 h-10 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
          title="Déconnexion"
        >
          <LogOut className="w-4 h-4" />
          <span className="pointer-events-none absolute left-12 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 shadow-lg">
            Déconnexion
          </span>
        </button>
      </div>
    </aside>
  )
}

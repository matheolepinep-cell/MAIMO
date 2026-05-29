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
        'flex items-center gap-3 px-3 py-2.5 rounded-xl mx-2 transition-all duration-150 group',
        active
          ? 'text-[#1E2761] font-semibold border-l-[3px] border-l-[#4C6EF5] pl-[9px]'
          : 'text-slate-500 hover:text-[#1E2761] hover:bg-[rgba(240,244,255,0.8)]'
      )}
      style={active ? {
        background: 'linear-gradient(135deg, rgba(30,39,97,0.07) 0%, rgba(76,110,245,0.05) 100%)',
      } : {}}
    >
      <Icon className={clsx('w-[18px] h-[18px] shrink-0', active ? 'text-[#4C6EF5]' : 'text-slate-400 group-hover:text-[#4C6EF5]')} />
      <span className="text-sm truncate">{label}</span>
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
    <aside className="hidden md:flex flex-col w-[200px] bg-white border-r border-[rgba(30,39,97,0.08)] min-h-screen py-5 shrink-0">

      {/* Logo */}
      <Link href="/app/dashboard" className="flex items-center gap-2.5 px-5 mb-8 group">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}>
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span
          className="font-extrabold text-[#1E2761] transition-all duration-200 group-hover:text-[#4C6EF5]"
          style={{ fontSize: 18, letterSpacing: '0.2em' }}
        >
          MAIMO
        </span>
      </Link>

      {/* Nav label */}
      <p className="px-5 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
        Navigation
      </p>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
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

      {/* Bottom section */}
      <div className="mt-auto pt-4 border-t border-[rgba(30,39,97,0.06)] mx-2">

        {profile?.role === 'admin' && (
          <Link
            href="/app/settings"
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group mb-0.5',
              pathname.startsWith('/app/settings')
                ? 'text-[#1E2761] font-semibold border-l-[3px] border-l-[#4C6EF5] pl-[9px]'
                : 'text-slate-500 hover:text-[#1E2761] hover:bg-[rgba(240,244,255,0.8)]'
            )}
            style={pathname.startsWith('/app/settings') ? {
              background: 'linear-gradient(135deg, rgba(30,39,97,0.07) 0%, rgba(76,110,245,0.05) 100%)',
            } : {}}
          >
            <Settings className="w-[18px] h-[18px] shrink-0 text-slate-400 group-hover:text-[#4C6EF5]" />
            <span className="text-sm">Paramètres</span>
          </Link>
        )}

        <Link
          href="/app/profile"
          className={clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group mb-0.5',
            pathname.startsWith('/app/profile')
              ? 'text-[#1E2761] font-semibold border-l-[3px] border-l-[#4C6EF5] pl-[9px]'
              : 'text-slate-500 hover:text-[#1E2761] hover:bg-[rgba(240,244,255,0.8)]'
          )}
          style={pathname.startsWith('/app/profile') ? {
            background: 'linear-gradient(135deg, rgba(30,39,97,0.07) 0%, rgba(76,110,245,0.05) 100%)',
          } : {}}
        >
          <div className="w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0 bg-[#1E2761]/10">
            {initials !== '?'
              ? <span className="text-[9px] font-bold text-[#1E2761]">{initials}</span>
              : <User className="w-3 h-3 text-slate-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{profile?.full_name ?? 'Profil'}</p>
            {profile?.role && (
              <p className="text-[10px] text-slate-400 capitalize">{profile.role}</p>
            )}
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 group"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="text-sm">Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}

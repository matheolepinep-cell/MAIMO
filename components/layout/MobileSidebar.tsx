'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, LayoutDashboard, Briefcase, Users, Settings, User } from 'lucide-react'

const navItems = [
  { href: '/app/search', icon: Search },
  { href: '/app/dashboard', icon: LayoutDashboard },
  { href: '/app/portfolio', icon: Briefcase },
  { href: '/app/team', icon: Users },
]

export function MobileSidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/app/search'
      ? pathname.startsWith('/app/search') || pathname === '/app'
      : pathname.startsWith(href)

  return (
    <aside
      className="md:hidden fixed left-0 top-0 bottom-0 z-40 w-11 flex flex-col items-center py-3 gap-1"
      style={{ background: '#0A1628' }}
    >
      <Link href="/app/search" className="mb-3 shrink-0">
        <div
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center"
          style={{ background: '#4C6EF5' }}
        >
          <span className="text-white font-bold text-xs">M</span>
        </div>
      </Link>

      {navItems.map(({ href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0"
          style={isActive(href) ? { background: '#1E3A6E' } : {}}
        >
          <Icon
            className="w-[18px] h-[18px]"
            style={{ color: isActive(href) ? 'white' : '#8899BB' }}
          />
        </Link>
      ))}

      <div className="flex-1" />

      <Link
        href="/app/settings"
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0"
        style={pathname.startsWith('/app/settings') ? { background: '#1E3A6E' } : {}}
      >
        <Settings
          className="w-[18px] h-[18px]"
          style={{ color: pathname.startsWith('/app/settings') ? 'white' : '#8899BB' }}
        />
      </Link>

      <Link
        href="/app/profile"
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0"
        style={pathname.startsWith('/app/profile') ? { background: '#1E3A6E' } : {}}
      >
        <User
          className="w-[18px] h-[18px]"
          style={{ color: pathname.startsWith('/app/profile') ? 'white' : '#8899BB' }}
        />
      </Link>
    </aside>
  )
}

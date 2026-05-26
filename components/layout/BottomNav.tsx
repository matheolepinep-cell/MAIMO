'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Search, User } from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { href: '/app/clients', icon: Users, label: 'Clients' },
  { href: '/app/search', icon: Search, label: 'Recherche' },
  { href: '/app/profile', icon: User, label: 'Profil' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40">
      <div className="flex items-center">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-150',
                active ? 'text-[#1E2761]' : 'text-[#94A3B8]'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-safe-area-inset-bottom bg-white" />
    </nav>
  )
}

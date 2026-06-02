'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, LayoutDashboard, Briefcase, Users, Settings, User, Menu } from 'lucide-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'

const navItems = [
  { href: '/app/search', icon: Search, label: 'Recherche' },
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/app/portfolio', icon: Briefcase, label: 'Portefeuille' },
  { href: '/app/team', icon: Users, label: 'Équipe' },
]

export function MobileSidebar() {
  const pathname = usePathname()
  const { open, close, toggle } = useMobileSidebar()

  const isActive = (href: string) =>
    href === '/app/search'
      ? pathname.startsWith('/app/search') || pathname === '/app'
      : pathname.startsWith(href)

  return (
    <>
      {/* Floating burger button — always visible on mobile when sidebar is closed */}
      {!open && (
        <button
          className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 8px rgba(10,22,40,0.10)' }}
          onClick={toggle}
          aria-label="Menu"
        >
          <Menu className="text-[#0A1628]" style={{ width: 22, height: 22 }} />
        </button>
      )}

      {/* Sidebar overlay — always rendered for smooth slide-in animation */}
      <div
        className="md:hidden fixed inset-0 z-50 transition-all duration-200"
        style={{
          background: open ? 'rgba(0,0,0,0.4)' : 'transparent',
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={close}
      >
        <aside
          className="fixed left-0 top-0 bottom-0 flex flex-col py-5 gap-1 transition-transform duration-200 ease-out"
          style={{
            background: '#0A1628',
            width: 220,
            transform: open ? 'translateX(0)' : 'translateX(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Logo */}
          <Link href="/app/search" className="flex items-center gap-3 px-4 mb-6 shrink-0" onClick={close}>
            <div
              className="flex items-center justify-center shrink-0 text-white font-bold text-base"
              style={{ background: '#4C6EF5', width: 36, height: 36, borderRadius: 10 }}
            >
              M
            </div>
            <span className="font-extrabold text-white text-lg" style={{ letterSpacing: '0.18em' }}>
              MAIMOO
            </span>
          </Link>

          {/* Nav items */}
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0"
              style={{
                padding: '12px 16px',
                background: isActive(href) ? '#1E3A6E' : 'transparent',
              }}
              onClick={close}
            >
              <Icon
                style={{ color: isActive(href) ? 'white' : '#8899BB', width: 22, height: 22 }}
              />
              <span
                style={{
                  color: isActive(href) ? 'white' : '#8899BB',
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                {label}
              </span>
            </Link>
          ))}

          <div className="flex-1" />

          {/* Settings */}
          <Link
            href="/app/settings"
            className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0"
            style={{
              padding: '12px 16px',
              background: pathname.startsWith('/app/settings') ? '#1E3A6E' : 'transparent',
            }}
            onClick={close}
          >
            <Settings
              style={{ color: pathname.startsWith('/app/settings') ? 'white' : '#8899BB', width: 22, height: 22 }}
            />
            <span style={{ color: pathname.startsWith('/app/settings') ? 'white' : '#8899BB', fontSize: 15, fontWeight: 500 }}>
              Paramètres
            </span>
          </Link>

          {/* Profile */}
          <Link
            href="/app/profile"
            className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0"
            style={{
              padding: '12px 16px',
              background: pathname.startsWith('/app/profile') ? '#1E3A6E' : 'transparent',
            }}
            onClick={close}
          >
            <User
              style={{ color: pathname.startsWith('/app/profile') ? 'white' : '#8899BB', width: 22, height: 22 }}
            />
            <span style={{ color: pathname.startsWith('/app/profile') ? 'white' : '#8899BB', fontSize: 15, fontWeight: 500 }}>
              Profil
            </span>
          </Link>
        </aside>
      </div>
    </>
  )
}

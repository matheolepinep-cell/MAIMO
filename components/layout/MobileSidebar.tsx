'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, LayoutDashboard, Briefcase, Users, Settings, User, Menu, MessageCircle, Bell } from 'lucide-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'
import { useUser } from '@/contexts/UserContext'
import { useNotificationCount } from '@/contexts/NotificationContext'
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext'
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector'
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal'

export function MobileSidebar() {
  const pathname = usePathname()
  const { profile } = useUser()
  const { open, close, toggle } = useMobileSidebar()
  const unreadCount = useNotificationCount()
  const hasUnreadMessages = useUnreadMessages()
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)

  const isActive = (href: string) =>
    href === '/app/search'
      ? pathname.startsWith('/app/search') || pathname === '/app'
      : href === '/app/portfolio'
      ? pathname.startsWith('/app/portfolio') || pathname.startsWith('/app/accounts')
      : pathname.startsWith(href)

  const navItems = [
    { href: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/app/search', icon: Search, label: 'Recherche IA' },
    { href: '/app/portfolio', icon: Briefcase, label: 'Portefeuille' },
    { href: '/app/messages', icon: MessageCircle, label: 'Messages' },
    { href: '/app/team', icon: Users, label: 'Équipe' },
  ]

  return (
    <>
      {/* Floating burger button */}
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

      {/* Sidebar overlay */}
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
          <Link href="/app/dashboard" className="flex items-center px-4 mb-4 shrink-0" onClick={close}>
            <Image
              src="/logo.png"
              alt="Maimoo"
              width={120}
              height={32}
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </Link>

          <WorkspaceSelector onCreateClick={() => setShowCreateWorkspace(true)} />

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
              <div className="relative shrink-0">
                <Icon style={{ color: isActive(href) ? 'white' : '#8899BB', width: 22, height: 22 }} />
                {href === '/app/messages' && hasUnreadMessages && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0A1628]" style={{ background: '#EF4444' }} />
                )}
              </div>
              <span style={{ color: isActive(href) ? 'white' : '#8899BB', fontSize: 15, fontWeight: 500 }}>
                {label}
              </span>
            </Link>
          ))}

          <div className="flex-1" />

          {/* Notifications */}
          <Link
            href="/app/notifications"
            className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0"
            style={{ padding: '12px 16px', background: pathname.startsWith('/app/notifications') ? '#1E3A6E' : 'transparent' }}
            onClick={close}
          >
            <div className="relative shrink-0">
              <Bell style={{ color: pathname.startsWith('/app/notifications') ? 'white' : '#8899BB', width: 22, height: 22 }} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                  style={{ background: '#EF4444' }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span style={{ color: pathname.startsWith('/app/notifications') ? 'white' : '#8899BB', fontSize: 15, fontWeight: 500 }}>
              Notifications
            </span>
          </Link>

          {/* Settings (admin only) */}
          {profile?.role === 'admin' && (
            <Link
              href="/app/settings"
              className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0"
              style={{ padding: '12px 16px', background: pathname.startsWith('/app/settings') ? '#1E3A6E' : 'transparent' }}
              onClick={close}
            >
              <Settings style={{ color: pathname.startsWith('/app/settings') ? 'white' : '#8899BB', width: 22, height: 22 }} />
              <span style={{ color: pathname.startsWith('/app/settings') ? 'white' : '#8899BB', fontSize: 15, fontWeight: 500 }}>
                Paramètres
              </span>
            </Link>
          )}

          {/* Profile */}
          <Link
            href="/app/profile"
            className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0"
            style={{ padding: '12px 16px', background: pathname.startsWith('/app/profile') ? '#1E3A6E' : 'transparent' }}
            onClick={close}
          >
            <User style={{ color: pathname.startsWith('/app/profile') ? 'white' : '#8899BB', width: 22, height: 22 }} />
            <span style={{ color: pathname.startsWith('/app/profile') ? 'white' : '#8899BB', fontSize: 15, fontWeight: 500 }}>
              Profil
            </span>
          </Link>
        </aside>
      </div>
      <CreateWorkspaceModal open={showCreateWorkspace} onClose={() => setShowCreateWorkspace(false)} />
    </>
  )
}

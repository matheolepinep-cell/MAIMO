'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, LayoutDashboard, Briefcase, Users, Settings, User, Menu, MessageCircle } from 'lucide-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'
import { useUser } from '@/contexts/UserContext'
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext'
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector'
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal'
import { useRole } from '@/hooks/useRole'

export function MobileSidebar() {
  const pathname = usePathname()
  const { profile } = useUser()
  const { open, close, toggle } = useMobileSidebar()
  const hasUnreadMessages = useUnreadMessages()
  const wsRole = useRole()
  const isContributeur = wsRole === 'contributeur'
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)

  const isActive = (href: string) =>
    href === '/app/search'
      ? pathname.startsWith('/app/search') || pathname === '/app'
      : href === '/app/portfolio'
      ? pathname.startsWith('/app/portfolio') || pathname.startsWith('/app/accounts')
      : pathname.startsWith(href)

  const allNavItems = [
    { href: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard', hidden: isContributeur },
    { href: '/app/search', icon: Search, label: 'Recherche IA', hidden: isContributeur },
    { href: '/app/portfolio', icon: Briefcase, label: 'Portefeuille', hidden: false },
    { href: '/app/messages', icon: MessageCircle, label: 'Messages', hidden: isContributeur },
    { href: '/app/team', icon: Users, label: 'Équipe', hidden: false },
  ]
  const navItems = allNavItems.filter((i) => !i.hidden)

  return (
    <>
      {!open && (
        <button
          className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
          onClick={toggle}
          aria-label="Menu"
        >
          <Menu className="text-[#0A0A0A]" style={{ width: 22, height: 22 }} />
        </button>
      )}

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
            background: '#FFFFFF',
            borderRight: '1px solid #E5E7EB',
            width: 220,
            transform: open ? 'translateX(0)' : 'translateX(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link href="/app/dashboard" className="flex items-center px-4 mb-4 shrink-0" onClick={close}>
            <Image src="/logo.png" alt="Maimoo" width={120} height={32} />
          </Link>

          <WorkspaceSelector onCreateClick={() => setShowCreateWorkspace(true)} />

          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0 hover:bg-[#F9FAFB]"
              style={{
                padding: '12px 16px',
                background: isActive(href) ? '#EFF6FF' : 'transparent',
                boxShadow: isActive(href) ? 'inset 3px 0 0 #2563EB' : 'none',
              }}
              onClick={close}
            >
              <div className="relative shrink-0">
                <Icon style={{ color: isActive(href) ? '#2563EB' : '#6B7280', width: 22, height: 22 }} />
                {href === '/app/messages' && hasUnreadMessages && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white" style={{ background: '#DC2626' }} />
                )}
              </div>
              <span style={{ color: isActive(href) ? '#2563EB' : '#6B7280', fontSize: 15, fontWeight: 500 }}>{label}</span>
            </Link>
          ))}

          <div className="flex-1" />

          <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
            {profile?.role === 'admin' && (
              <Link
                href="/app/settings"
                className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0 hover:bg-[#F9FAFB]"
                style={{ padding: '12px 16px', background: pathname.startsWith('/app/settings') ? '#EFF6FF' : 'transparent' }}
                onClick={close}
              >
                <Settings style={{ color: pathname.startsWith('/app/settings') ? '#2563EB' : '#6B7280', width: 22, height: 22 }} />
                <span style={{ color: pathname.startsWith('/app/settings') ? '#2563EB' : '#6B7280', fontSize: 15, fontWeight: 500 }}>Paramètres</span>
              </Link>
            )}

            <Link
              href="/app/profile"
              className="flex items-center gap-3 mx-2 rounded-xl transition-all duration-150 shrink-0 hover:bg-[#F9FAFB]"
              style={{ padding: '12px 16px', background: pathname.startsWith('/app/profile') ? '#EFF6FF' : 'transparent' }}
              onClick={close}
            >
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#2563EB' }}>
                <User style={{ color: 'white', width: 14, height: 14 }} />
              </div>
              <span style={{ color: pathname.startsWith('/app/profile') ? '#2563EB' : '#6B7280', fontSize: 15, fontWeight: 500 }}>Profil</span>
            </Link>
          </div>
        </aside>
      </div>
      <CreateWorkspaceModal open={showCreateWorkspace} onClose={() => setShowCreateWorkspace(false)} />
    </>
  )
}

'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, LayoutDashboard, Briefcase, Users, Settings, User, ChevronDown, MessageCircle, Bell } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useNotificationCount } from '@/contexts/NotificationContext'
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext'
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector'
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal'
import { useRole } from '@/hooks/useRole'

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
  dot,
  onClick,
}: {
  href?: string
  icon: React.ElementType
  label: string
  active: boolean
  badge?: number
  dot?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <div className="relative shrink-0">
        <Icon className="w-[18px] h-[18px]" style={{ color: active ? '#2563EB' : '#6B7280' }} />
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white" style={{ background: '#DC2626' }} />
        )}
      </div>
      <span className="text-sm truncate flex-1" style={{ color: active ? '#2563EB' : '#6B7280' }}>{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
          style={{ background: '#DC2626' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  )

  const activeStyle = active
    ? { background: '#EFF6FF', borderRadius: 10, boxShadow: 'inset 3px 0 0 #2563EB' }
    : {}

  const className = 'flex items-center gap-3 px-3 py-2.5 mx-2 transition-all duration-150 rounded-[10px] w-[calc(100%-16px)] hover:bg-[#F9FAFB]'

  if (href) {
    return (
      <Link href={href} className={className} style={activeStyle}>
        {content}
      </Link>
    )
  }
  return (
    <button onClick={onClick} className={className} style={activeStyle}>
      {content}
    </button>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { profile } = useUser()
  const unreadCount = useNotificationCount()
  const hasUnreadMessages = useUnreadMessages()
  const wsRole = useRole()
  const isContributeur = wsRole === 'contributeur'
  const [portfolioOpen, setPortfolioOpen] = useState(
    pathname.startsWith('/app/portfolio') || pathname.startsWith('/app/accounts')
  )
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)

  const initials = profile?.full_name
    ?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? '?'

  const isPortfolioActive = pathname.startsWith('/app/portfolio') || pathname.startsWith('/app/accounts')

  return (
    <aside
      className="hidden md:flex flex-col w-[200px] fixed top-0 left-0 h-screen overflow-y-auto py-5 z-30"
      style={{ background: '#FFFFFF', borderRight: '1px solid #E5E7EB' }}
    >
      <Link href="/app/dashboard" className="flex items-center px-5 mb-4 group transition-opacity duration-200 group-hover:opacity-70">
        <Image
          src="/logo.png"
          alt="Maimoo"
          width={120}
          height={32}
        />
      </Link>

      <WorkspaceSelector onCreateClick={() => setShowCreateWorkspace(true)} />
      <CreateWorkspaceModal open={showCreateWorkspace} onClose={() => setShowCreateWorkspace(false)} />

      <nav className="flex flex-col gap-0.5 flex-1">
        {!isContributeur && (
          <NavItem href="/app/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname.startsWith('/app/dashboard')} />
        )}
        {!isContributeur && (
          <NavItem href="/app/search" icon={Search} label="Recherche IA" active={pathname.startsWith('/app/search') || pathname === '/app'} />
        )}

        <div>
          <button
            onClick={() => setPortfolioOpen((v) => !v)}
            className="flex items-center gap-3 px-3 py-2.5 mx-2 transition-all duration-150 rounded-[10px] w-[calc(100%-16px)] hover:bg-[#F9FAFB]"
            style={isPortfolioActive ? { background: '#EFF6FF', boxShadow: 'inset 3px 0 0 #2563EB' } : {}}
          >
            <Briefcase className="w-[18px] h-[18px] shrink-0" style={{ color: isPortfolioActive ? '#2563EB' : '#6B7280' }} />
            <span className="flex-1 text-sm text-left truncate" style={{ color: isPortfolioActive ? '#2563EB' : '#6B7280' }}>Portefeuille</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
              style={{ color: isPortfolioActive ? '#2563EB' : '#6B7280', transform: portfolioOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>
          {portfolioOpen && (
            <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
              <Link href="/app/portfolio" className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg transition-all duration-150 hover:bg-[#F9FAFB]"
                style={pathname.startsWith('/app/portfolio') ? { background: '#EFF6FF' } : {}}>
                <span className="text-xs" style={{ color: pathname.startsWith('/app/portfolio') ? '#2563EB' : '#6B7280' }}>Perso</span>
              </Link>
              {!isContributeur && (
                <Link href="/app/accounts" className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg transition-all duration-150 hover:bg-[#F9FAFB]"
                  style={pathname.startsWith('/app/accounts') ? { background: '#EFF6FF' } : {}}>
                  <span className="text-xs" style={{ color: pathname.startsWith('/app/accounts') ? '#2563EB' : '#6B7280' }}>Global</span>
                </Link>
              )}
            </div>
          )}
        </div>

        {!isContributeur && (
          <NavItem href="/app/messages" icon={MessageCircle} label="Messages" active={pathname.startsWith('/app/messages')} dot={hasUnreadMessages} />
        )}
        <NavItem href="/app/team" icon={Users} label="Équipe" active={pathname.startsWith('/app/team')} />
      </nav>

      <div className="mt-auto pt-4 mx-2 flex flex-col gap-0.5" style={{ borderTop: '1px solid #E5E7EB' }}>
        <NavItem href="/app/notifications" icon={Bell} label="Notifications" active={pathname.startsWith('/app/notifications')} badge={unreadCount} />
        {profile?.role === 'admin' && (
          <NavItem href="/app/settings" icon={Settings} label="Paramètres" active={pathname.startsWith('/app/settings')} />
        )}
        <Link href="/app/profile" className="flex items-center gap-3 px-3 py-2.5 mx-0 transition-all duration-150 rounded-[10px] hover:bg-[#F9FAFB]"
          style={pathname.startsWith('/app/profile') ? { background: '#EFF6FF', boxShadow: 'inset 3px 0 0 #2563EB', borderRadius: 10 } : {}}>
          <div className="w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0" style={{ background: '#2563EB' }}>
            {initials !== '?' ? <span className="text-[9px] font-bold text-white">{initials}</span> : <User className="w-3 h-3 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: pathname.startsWith('/app/profile') ? '#2563EB' : '#6B7280' }}>
              {profile?.full_name ?? 'Profil'}
            </p>
            {profile?.role && <p className="text-[10px] capitalize" style={{ color: '#9B9B9B' }}>{profile.role}</p>}
          </div>
        </Link>
      </div>
    </aside>
  )
}

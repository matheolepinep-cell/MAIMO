'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, LayoutDashboard, Briefcase, Users, Settings, User, ChevronDown, MessageCircle, Bell } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useNotificationCount } from '@/contexts/NotificationContext'
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext'
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector'

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
        <Icon className="w-[18px] h-[18px]" style={{ color: active ? 'white' : '#8899BB' }} />
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0A1628]" style={{ background: '#EF4444' }} />
        )}
      </div>
      <span className="text-sm truncate flex-1" style={{ color: active ? 'white' : '#8899BB' }}>{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
          style={{ background: '#EF4444' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  )

  const style = active ? { background: '#1E3A6E', borderRadius: 10 } : {}
  const className = 'flex items-center gap-3 px-3 py-2.5 mx-2 transition-all duration-150 rounded-[10px] w-[calc(100%-16px)]'

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {content}
      </Link>
    )
  }
  return (
    <button onClick={onClick} className={className} style={style}>
      {content}
    </button>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { profile } = useUser()
  const unreadCount = useNotificationCount()
  const hasUnreadMessages = useUnreadMessages()
  const [portfolioOpen, setPortfolioOpen] = useState(
    pathname.startsWith('/app/portfolio') || pathname.startsWith('/app/accounts')
  )
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)

  const initials = profile?.full_name
    ?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? '?'

  const isPortfolioActive = pathname.startsWith('/app/portfolio') || pathname.startsWith('/app/accounts')

  return (
    <aside
      className="hidden md:flex flex-col w-[200px] min-h-screen py-5 shrink-0"
      style={{ background: '#0A1628' }}
    >
      {/* Logo */}
      <Link href="/app/dashboard" className="flex items-center gap-2.5 px-5 mb-4 group">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ background: '#4C6EF5' }}
        >
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span
          className="font-extrabold text-white transition-all duration-200 group-hover:opacity-80"
          style={{ fontSize: 18, letterSpacing: '0.2em' }}
        >
          MAIMOO
        </span>
      </Link>

      <WorkspaceSelector onCreateClick={() => setShowCreateWorkspace(true)} />
      {/* showCreateWorkspace modal wired in ÉTAPE 4 */}
      {showCreateWorkspace && (
        <div style={{ display: 'none' }} />
      )}

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        <NavItem
          href="/app/dashboard"
          icon={LayoutDashboard}
          label="Dashboard"
          active={pathname.startsWith('/app/dashboard')}
        />
        <NavItem
          href="/app/search"
          icon={Search}
          label="Recherche IA"
          active={pathname.startsWith('/app/search') || pathname === '/app'}
        />

        {/* Portefeuille with sub-items */}
        <div>
          <button
            onClick={() => setPortfolioOpen((v) => !v)}
            className="flex items-center gap-3 px-3 py-2.5 mx-2 transition-all duration-150 rounded-[10px] w-[calc(100%-16px)]"
            style={isPortfolioActive ? { background: '#1E3A6E' } : {}}
          >
            <Briefcase className="w-[18px] h-[18px] shrink-0" style={{ color: isPortfolioActive ? 'white' : '#8899BB' }} />
            <span className="flex-1 text-sm text-left truncate" style={{ color: isPortfolioActive ? 'white' : '#8899BB' }}>
              Portefeuille
            </span>
            <ChevronDown
              className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
              style={{ color: isPortfolioActive ? 'white' : '#8899BB', transform: portfolioOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {portfolioOpen && (
            <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
              <Link
                href="/app/portfolio"
                className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg transition-all duration-150"
                style={pathname.startsWith('/app/portfolio') ? { background: 'rgba(255,255,255,0.08)' } : {}}
              >
                <span className="text-xs" style={{ color: pathname.startsWith('/app/portfolio') ? 'white' : '#8899BB' }}>
                  Perso
                </span>
              </Link>
              <Link
                href="/app/accounts"
                className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg transition-all duration-150"
                style={pathname.startsWith('/app/accounts') ? { background: 'rgba(255,255,255,0.08)' } : {}}
              >
                <span className="text-xs" style={{ color: pathname.startsWith('/app/accounts') ? 'white' : '#8899BB' }}>
                  Global
                </span>
              </Link>
            </div>
          )}
        </div>

        <NavItem
          href="/app/messages"
          icon={MessageCircle}
          label="Messages"
          active={pathname.startsWith('/app/messages')}
          dot={hasUnreadMessages}
        />
        <NavItem
          href="/app/team"
          icon={Users}
          label="Équipe"
          active={pathname.startsWith('/app/team')}
        />
      </nav>

      {/* Bottom section */}
      <div className="mt-auto pt-4 mx-2 flex flex-col gap-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <NavItem
          href="/app/notifications"
          icon={Bell}
          label="Notifications"
          active={pathname.startsWith('/app/notifications')}
          badge={unreadCount}
        />

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
          className="flex items-center gap-3 px-3 py-2.5 mx-0 transition-all duration-150 rounded-[10px]"
          style={pathname.startsWith('/app/profile') ? { background: '#1E3A6E' } : {}}
        >
          <div
            className="w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            {initials !== '?'
              ? <span className="text-[9px] font-bold text-white">{initials}</span>
              : <User className="w-3 h-3" style={{ color: '#8899BB' }} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: pathname.startsWith('/app/profile') ? 'white' : '#8899BB' }}>
              {profile?.full_name ?? 'Profil'}
            </p>
            {profile?.role && (
              <p className="text-[10px] capitalize" style={{ color: '#8899BB' }}>{profile.role}</p>
            )}
          </div>
        </Link>
      </div>
    </aside>
  )
}

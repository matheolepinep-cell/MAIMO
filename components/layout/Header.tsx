'use client'

import { Menu } from 'lucide-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'
import { useUser } from '@/contexts/UserContext'

interface HeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  const { toggle } = useMobileSidebar()
  const { profile } = useUser()

  return (
    <header className="lg:hidden bg-white border-b border-[rgba(0,0,0,0.08)] px-3 py-2.5 flex items-center gap-2 sticky top-0 z-30" style={{ height: 52 }}>
      <button
        onClick={toggle}
        style={{
          width: 36, height: 36, borderRadius: 9,
          border: 'none', background: 'none',
          cursor: 'pointer', color: '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Menu style={{ width: 20, height: 20 }} />
      </button>

      <span className={
        title
          ? 'flex-1 font-semibold text-[#0F172A] text-[15px] truncate'
          : 'flex-1 font-extrabold text-[#0A0A0A] text-[15px]'
      }
        style={!title ? { letterSpacing: '0.15em' } : {}}>
        {title || 'MAIMOO'}
      </span>

      {actions}

      {profile && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ background: '#2563EB' }}
        >
          {profile.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </div>
      )}
    </header>
  )
}

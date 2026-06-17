'use client'

import { useUser } from '@/contexts/UserContext'

interface HeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  const { profile } = useUser()

  return (
    <header className="md:hidden bg-white border-b border-[rgba(0,0,0,0.08)] px-4 pl-14 py-3 flex items-center gap-3 sticky top-0 z-30">
      <span className={
        title
          ? 'flex-1 font-semibold text-[#0F172A] text-[15px]'
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

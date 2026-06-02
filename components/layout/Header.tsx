'use client'

import { useUser } from '@/contexts/UserContext'
import { BurgerButton } from '@/components/layout/BurgerButton'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const { profile } = useUser()

  return (
    <header className="md:hidden bg-white border-b border-[rgba(30,39,97,0.08)] px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
      <BurgerButton />
      <span className={
        title
          ? 'flex-1 font-semibold text-[#0F172A] text-sm'
          : 'flex-1 font-extrabold text-[#1E2761] text-sm'
      }
        style={!title ? { letterSpacing: '0.15em' } : {}}>
        {title || 'MAIMOO'}
      </span>
      {profile && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}
        >
          {profile.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </div>
      )}
    </header>
  )
}

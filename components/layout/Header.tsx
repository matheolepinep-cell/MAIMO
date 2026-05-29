'use client'

import { useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const router = useRouter()
  const { profile } = useUser()

  return (
    <header className="md:hidden bg-white border-b border-[rgba(30,39,97,0.08)] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
      <button
        onClick={() => router.push('/app/dashboard')}
        className="flex items-center gap-2 group"
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}
        >
          <span className="text-white font-bold text-xs">M</span>
        </div>
        <span className={
          title
            ? 'font-semibold text-[#0F172A] text-sm'
            : 'font-extrabold text-[#1E2761] text-sm group-hover:text-[#4C6EF5] transition-colors duration-150'
        }
          style={!title ? { letterSpacing: '0.15em' } : {}}>
          {title || 'MAIMO'}
        </span>
      </button>
      {profile && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #1E2761 0%, #3B5BDB 100%)' }}
        >
          {profile.full_name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </div>
      )}
    </header>
  )
}

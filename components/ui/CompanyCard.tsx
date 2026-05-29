'use client'

import { ChevronRight, Globe, Lock, Users } from 'lucide-react'
import { clsx } from 'clsx'

const PALETTE = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
]

export function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff
  return PALETTE[h % PALETTE.length]
}

export function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

interface CompanyCardProps {
  name: string
  city?: string | null
  industry?: string | null
  status: 'client' | 'prospect'
  visibility?: 'team' | 'private' | 'custom'
  onClick?: () => void
  className?: string
  rightSlot?: React.ReactNode
}

export function CompanyCard({ name, city, industry, status, visibility, onClick, className, rightSlot }: CompanyCardProps) {
  const color = getAvatarColor(name)

  const VisIcon = visibility === 'private' ? Lock : visibility === 'custom' ? Users : Globe
  const visLabel = visibility === 'private' ? 'Privé' : visibility === 'custom' ? 'Personnalisé' : "Équipe"

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-2xl p-4 flex items-center gap-3 transition-all duration-200',
        onClick && 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]',
        className
      )}
      style={{
        border: '1px solid rgba(30,39,97,0.08)',
        boxShadow: '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)',
      }}
      onMouseEnter={onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(30,39,97,0.10), 0 8px_24px rgba(30,39,97,0.08)'
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.05)'
      } : undefined}
    >
      {/* Avatar */}
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold', color.bg, color.text)}>
        {getInitials(name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-[#0F172A] truncate text-sm">{name}</p>
          <span
            className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
            style={status === 'prospect' ? {
              background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
              color: '#92400E',
              borderColor: 'rgba(245,158,11,0.2)',
            } : {
              background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
              color: '#065F46',
              borderColor: 'rgba(16,185,129,0.2)',
            }}
          >
            {status === 'prospect' ? 'Prospect' : 'Client'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {city && <span className="text-xs text-slate-400 truncate">{city}</span>}
          {city && industry && <span className="text-xs text-slate-300">·</span>}
          {industry && <span className="text-xs text-slate-400 truncate">{industry}</span>}
          {visibility && (
            <>
              {(city || industry) && <span className="text-xs text-slate-300">·</span>}
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <VisIcon className="w-3 h-3" />{visLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right slot or arrow */}
      {rightSlot ?? (onClick && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />)}
    </div>
  )
}

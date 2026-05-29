'use client'

import { ChevronRight, Globe, Lock, Users } from 'lucide-react'
import { clsx } from 'clsx'

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
    >
      {/* Avatar — fixed color */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
        style={{ background: '#4C6EF5' }}>
        {getInitials(name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[#0F172A] truncate text-sm">{name}</p>
          {/* Status dot */}
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ background: status === 'client' ? '#10B981' : '#F59E0B' }}
            title={status === 'client' ? 'Client' : 'Prospect'}
          />
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

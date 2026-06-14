'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronsUpDown, Check, Plus } from 'lucide-react'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Workspace } from '@/types/database'

type Props = {
  onCreateClick: () => void
}

export function WorkspaceSelector({ onCreateClick }: Props) {
  const { currentWorkspace, userWorkspaces, setCurrentWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!currentWorkspace) return null

  return (
    <div ref={ref} className="relative px-2 mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl transition-all duration-150"
        style={{ background: 'rgba(255,255,255,0.07)' }}
      >
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: `#${currentWorkspace.color}` }}
        />
        <span className="flex-1 text-sm font-medium truncate text-white text-left">
          {currentWorkspace.name}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" style={{ color: '#6B6B6B' }} />
      </button>

      {open && (
        <div
          className="absolute left-2 right-2 top-full mt-1 rounded-xl py-1 z-50"
          style={{
            background: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {userWorkspaces.map((ws: Workspace) => (
            <button
              key={ws.id}
              onClick={() => { setCurrentWorkspace(ws); setOpen(false) }}
              className="flex items-center gap-2.5 w-full px-3 py-2 transition-all duration-100"
              style={{ background: 'transparent' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: `#${ws.color}` }}
              />
              <span
                className="flex-1 text-sm truncate text-left"
                style={{ color: ws.id === currentWorkspace.id ? 'white' : '#6B6B6B' }}
              >
                {ws.name}
              </span>
              {ws.id === currentWorkspace.id && (
                <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'white' }} />
              )}
            </button>
          ))}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 12px' }} />

          <button
            onClick={() => { setOpen(false); onCreateClick() }}
            disabled={userWorkspaces.length >= 5}
            className="flex items-center gap-2.5 w-full px-3 py-2 transition-all duration-100 disabled:opacity-40"
            onMouseEnter={(e) => {
              if (userWorkspaces.length < 5) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" style={{ color: '#6B6B6B' }} />
            <span className="text-sm" style={{ color: '#6B6B6B' }}>
              {userWorkspaces.length >= 5 ? 'Maximum 5 espaces' : 'Créer un espace'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

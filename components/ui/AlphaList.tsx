'use client'

import { useRef, useCallback } from 'react'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export interface AlphaItem {
  id: string
  name: string
}

interface AlphaListProps {
  items: AlphaItem[]
  renderItem: (item: AlphaItem) => React.ReactNode
  emptyState?: React.ReactNode
}

function getLetter(name: string): string {
  const first = name.trim()[0]?.toUpperCase() ?? '#'
  return /[A-Z]/.test(first) ? first : '#'
}

export function AlphaList({ items, renderItem, emptyState }: AlphaListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Group items by letter
  const groups: Record<string, AlphaItem[]> = {}
  for (const item of items) {
    const letter = getLetter(item.name)
    if (!groups[letter]) groups[letter] = []
    groups[letter].push(item)
  }
  const presentLetters = new Set(Object.keys(groups))

  const scrollTo = useCallback((letter: string) => {
    const el = sectionRefs.current[letter]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  if (items.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className="flex gap-2">
      {/* Main list */}
      <div ref={containerRef} className="flex-1 min-w-0 space-y-4">
        {ALPHABET.filter((l) => presentLetters.has(l)).concat(presentLetters.has('#') ? ['#'] : []).map((letter) => (
          <div key={letter} ref={(el) => { sectionRefs.current[letter] = el }}>
            {/* Section header */}
            <div
              className="sticky top-0 z-10 px-3 py-1 mb-2 text-xs font-bold"
              style={{ background: '#F0F4FF', color: '#1E2761', borderRadius: 6 }}
            >
              {letter}
            </div>
            <div className="space-y-2.5">
              {groups[letter].map((item) => renderItem(item))}
            </div>
          </div>
        ))}
      </div>

      {/* Alpha index — desktop */}
      <div className="hidden md:flex flex-col items-center gap-0.5 sticky top-0 self-start pt-1 shrink-0">
        {ALPHABET.map((letter) => {
          const active = presentLetters.has(letter)
          return (
            <button
              key={letter}
              onClick={() => active && scrollTo(letter)}
              disabled={!active}
              className="w-5 text-center text-[11px] leading-[1.4] transition-colors"
              style={{
                color: active ? '#8899BB' : '#D1D5DB',
                fontWeight: active ? 500 : 400,
                cursor: active ? 'pointer' : 'default',
              }}
            >
              {letter}
            </button>
          )
        })}
      </div>

      {/* Alpha index — mobile (right edge) */}
      <div className="md:hidden flex flex-col items-center gap-0 fixed right-0 top-1/2 -translate-y-1/2 z-20 py-1 px-0.5">
        {ALPHABET.map((letter) => {
          const active = presentLetters.has(letter)
          return (
            <button
              key={letter}
              onClick={() => active && scrollTo(letter)}
              disabled={!active}
              className="w-4 text-center leading-[1.3] transition-colors"
              style={{
                fontSize: 10,
                color: active ? '#1E2761' : '#D1D5DB',
                fontWeight: active ? 700 : 400,
                cursor: active ? 'pointer' : 'default',
              }}
            >
              {letter}
            </button>
          )
        })}
      </div>
    </div>
  )
}

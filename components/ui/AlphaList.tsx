'use client'

import { useRef, useCallback, useState, useEffect } from 'react'

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
  const [activeSection, setActiveSection] = useState<string | null>(null)

  // Group items by letter
  const groups: Record<string, AlphaItem[]> = {}
  for (const item of items) {
    const letter = getLetter(item.name)
    if (!groups[letter]) groups[letter] = []
    groups[letter].push(item)
  }
  const presentLetters = new Set(Object.keys(groups))

  // Track active section via scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Walk up DOM to find scrollable ancestor
    let scrollEl: HTMLElement | null = container.parentElement
    while (scrollEl) {
      const { overflow, overflowY } = window.getComputedStyle(scrollEl)
      if (['auto', 'scroll'].includes(overflow) || ['auto', 'scroll'].includes(overflowY)) break
      scrollEl = scrollEl.parentElement
    }

    const computeActive = () => {
      const refs = sectionRefs.current
      const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0
      let found: string | null = null
      for (const letter of [...ALPHABET, '#']) {
        const el = refs[letter]
        if (!el) continue
        const sectionTop = el.getBoundingClientRect().top - containerTop
        if (sectionTop <= 64) found = letter
      }
      setActiveSection(found)
    }

    const target: EventTarget = scrollEl ?? window
    computeActive()
    target.addEventListener('scroll', computeActive, { passive: true })
    return () => target.removeEventListener('scroll', computeActive)
  }, [items])

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
              className="sticky top-0 z-10 px-4 py-1 mb-2 text-xs font-bold"
              style={{ background: '#F5F5F5', color: '#0A0A0A', borderRadius: 6 }}
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
          const present = presentLetters.has(letter)
          const isActive = activeSection === letter
          return (
            <button
              key={letter}
              onClick={() => present && scrollTo(letter)}
              disabled={!present}
              className="w-5 text-center text-[11px] leading-[1.4] transition-colors"
              style={{
                color: isActive ? '#0A0A0A' : present ? '#6B6B6B' : '#CBD5E1',
                fontWeight: isActive ? 500 : present ? 400 : 400,
                cursor: present ? 'pointer' : 'default',
              }}
            >
              {letter}
            </button>
          )
        })}
      </div>

      {/* Alpha index — mobile (right edge, fixed) */}
      <div className="md:hidden flex flex-col items-center gap-0 fixed right-0 top-1/2 -translate-y-1/2 z-20 py-1 px-0.5">
        {ALPHABET.map((letter) => {
          const present = presentLetters.has(letter)
          const isActive = activeSection === letter
          return (
            <button
              key={letter}
              onClick={() => present && scrollTo(letter)}
              disabled={!present}
              className="w-4 text-center leading-[1.3] transition-colors"
              style={{
                fontSize: 10,
                color: isActive ? '#0A0A0A' : present ? '#6B6B6B' : '#CBD5E1',
                fontWeight: isActive ? 500 : 400,
                cursor: present ? 'pointer' : 'default',
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

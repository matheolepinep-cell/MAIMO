'use client'

import { Children, useEffect, useRef, useState, type ReactNode } from 'react'

interface CarouselSectionProps {
  children: ReactNode
  desktopClass?: string
  className?: string
}

export function CarouselSection({ children, desktopClass = 'grid grid-cols-3 gap-6', className = '' }: CarouselSectionProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const childArray = Children.toArray(children)
  const count = childArray.length

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const centerX = el.scrollLeft + el.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      Array.from(el.children).forEach((child, i) => {
        const c = child as HTMLElement
        const childCenter = c.offsetLeft + c.clientWidth / 2
        const dist = Math.abs(childCenter - centerX)
        if (dist < bestDist) { bestDist = dist; best = i }
      })
      setActiveIndex(best)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile])

  if (!isMobile) {
    return <div className={[desktopClass, className].filter(Boolean).join(' ')}>{children}</div>
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {childArray.map((child, i) => (
          <div
            key={i}
            style={{ scrollSnapAlign: 'center', flexShrink: 0, width: '82vw', minWidth: 0 }}
          >
            {child}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 20 }}>
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            style={{
              display: 'block',
              width: i === activeIndex ? 8 : 6,
              height: i === activeIndex ? 8 : 6,
              borderRadius: '50%',
              background: i === activeIndex ? '#2563EB' : '#E5E7EB',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}

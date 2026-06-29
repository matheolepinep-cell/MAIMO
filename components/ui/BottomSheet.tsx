'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children, footer }: BottomSheetProps) {
  const [sheetStyle, setSheetStyle] = useState<React.CSSProperties>({})
  const [mounted, setMounted] = useState(false)
  const savedScrollY = useRef(0)

  useEffect(() => { setMounted(true) }, [])

  // Body scroll lock + visualViewport tracking
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      return
    }

    savedScrollY.current = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY.current}px`
    document.body.style.width = '100%'

    const updateSheet = () => {
      const vv = window.visualViewport
      if (!vv) return
      setSheetStyle({
        height: vv.height * 0.85,
        transform: `translateY(${vv.offsetTop}px)`,
      })
    }

    updateSheet()
    window.visualViewport?.addEventListener('resize', updateSheet)
    window.visualViewport?.addEventListener('scroll', updateSheet)

    return () => {
      window.visualViewport?.removeEventListener('resize', updateSheet)
      window.visualViewport?.removeEventListener('scroll', updateSheet)
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, savedScrollY.current)
    }
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
    }}>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Sheet — not position:fixed */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: '#ffffff',
        borderRadius: '20px 20px 0 0',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '85%',
        ...sheetStyle,
        transition: 'height 0.2s ease-out, transform 0.2s ease-out',
      }}>
        {/* Handle */}
        <div style={{
          width: 36, height: 4, background: '#E5E7EB',
          borderRadius: 2, margin: '12px auto 0', flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #F3F4F6',
          flexShrink: 0,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0A0A0A' }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'none', border: 'none',
              padding: 4, cursor: 'pointer',
              color: '#9CA3AF', display: 'flex',
              alignItems: 'center', borderRadius: 8,
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
        }}>
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div style={{
            padding: '12px 20px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            borderTop: '1px solid #F3F4F6',
            background: '#ffffff',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

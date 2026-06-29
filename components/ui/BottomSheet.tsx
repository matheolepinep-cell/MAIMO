'use client'

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
  const [viewportHeight, setViewportHeight] = useState(800)
  const [viewportOffsetTop, setViewportOffsetTop] = useState(0)
  const savedScrollY = useRef(0)

  // Track visual viewport — follows keyboard on iOS (vs window.innerHeight which stays fixed)
  useEffect(() => {
    if (!open) return

    const update = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height)
        setViewportOffsetTop(window.visualViewport.offsetTop)
      }
    }

    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [open])

  // Block body scroll while open — iOS Safari requires position:fixed trick
  useEffect(() => {
    if (!open) return
    savedScrollY.current = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY.current}px`
    document.body.style.width = '100%'
    return () => {
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

  if (!open) return null

  const naturalHeight = window.innerHeight
  const keyboardOpen = viewportHeight < naturalHeight - 100

  return (
    <>
      {/* Full-screen overlay — above bottom nav z-50 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
        }}
      />

      {/*
        Outer container anchored to the visual viewport.
        It tracks keyboard position automatically via visualViewport.offsetTop + height.
        pointer-events:none so clicks on empty space hit the overlay above.
      */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: viewportOffsetTop,
          height: viewportHeight,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {/* Sheet */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px 20px 0 0',
            maxHeight: '85%',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto',
            paddingBottom: keyboardOpen ? '8px' : 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Drag handle */}
          <div style={{
            width: 36,
            height: 4,
            background: '#E5E7EB',
            borderRadius: 2,
            margin: '12px auto 0',
            flexShrink: 0,
          }} />

          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
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
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: '#9CA3AF',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 8,
              }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {children}
          </div>

          {/* Optional sticky footer (always visible above keyboard) */}
          {footer && (
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #F3F4F6',
              background: '#ffffff',
              flexShrink: 0,
            }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

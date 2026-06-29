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
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const savedScrollY = useRef(0)

  // Track keyboard height via visualViewport.
  // With interactive-widget=resizes-content (iOS 16+), the layout viewport itself
  // shrinks when the keyboard opens, so innerHeight === visualViewport.height
  // and keyboardHeight stays 0 — the transform does nothing and position:fixed;bottom:0
  // is naturally above the keyboard.
  // On older iOS where the viewport doesn't shrink, keyboardHeight > 0 and
  // transform:translateY(-keyboardHeight) moves the sheet above the keyboard.
  useEffect(() => {
    const update = () => {
      if (window.visualViewport) {
        setKeyboardHeight(Math.max(0, window.innerHeight - window.visualViewport.height))
      }
    }
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])

  // Reset keyboard height when modal closes
  useEffect(() => {
    if (!open) setKeyboardHeight(0)
  }, [open])

  // Block body scroll while open.
  // position:fixed + top:-scrollY is required on iOS Safari;
  // overflow:hidden alone doesn't block scroll.
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

  return (
    <>
      {/* Overlay — covers the full screen including bottom nav (z-50) */}
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
        Sheet: position:fixed;bottom:0 is the baseline.

        iOS 16+ (interactive-widget=resizes-content): layout viewport shrinks with
        keyboard, so bottom:0 is already above the keyboard — keyboardHeight=0,
        transform=translateY(0), no JS movement needed.

        iOS 13-15 (no resize-content): layout viewport stays full height,
        keyboard covers bottom. keyboardHeight>0 and transform moves sheet up.
      */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          transform: `translateY(${-keyboardHeight}px)`,
          transition: 'transform 0.2s ease-out',
          // dvh = dynamic viewport height (shrinks with keyboard on iOS 15.4+)
          // vh fallback for older browsers
          maxHeight: `min(85dvh, calc(85vh - ${keyboardHeight}px))`,
          background: '#ffffff',
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: keyboardHeight > 0 ? '8px' : 'env(safe-area-inset-bottom)',
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

        {/* Optional footer — always visible above keyboard */}
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
    </>
  )
}

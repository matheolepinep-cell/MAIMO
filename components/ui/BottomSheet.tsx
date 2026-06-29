'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setKeyboardHeight(Math.max(0, window.innerHeight - window.visualViewport.height))
      }
    }
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => window.visualViewport?.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!open) {
      setKeyboardHeight(0)
      return
    }
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Overlay — above bottom nav (z-50) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
        }}
      />

      {/* Sheet — rises above keyboard via bottom offset */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: keyboardHeight,
          zIndex: 10000,
          background: '#ffffff',
          borderRadius: '20px 20px 0 0',
          maxHeight: `calc(90vh - ${keyboardHeight}px)`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'bottom 0.25s ease-out',
          paddingBottom: keyboardHeight === 0 ? 'env(safe-area-inset-bottom)' : '8px',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: '#E5E7EB', borderRadius: 2, margin: '12px auto 4px', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px 12px',
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

        {/* Optional sticky footer (submit button, etc.) */}
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

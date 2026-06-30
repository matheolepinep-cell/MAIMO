'use client'

import { useState, useRef, useEffect } from 'react'

interface SupportWidgetProps {
  userName?: string
  userEmail?: string
  role?: string
}

const CATEGORIES = [
  { id: 'bug', label: 'Signaler un bug' },
  { id: 'suggestion', label: 'Faire une suggestion' },
  { id: 'question', label: "J'ai une question" },
]

const STORAGE_KEY = 'support-widget-pos'
const DEFAULT_POS = { bottom: 76, right: 16 }
const BTN_SIZE = 52

function loadPos(): { bottom: number; right: number } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return DEFAULT_POS
}

export default function SupportWidget({ userName, userEmail, role }: SupportWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isSent, setIsSent] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [category, setCategory] = useState('')
  const [isHidden, setIsHidden] = useState(false)
  const [pos, setPos] = useState(DEFAULT_POS)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const dragRef = useRef<{
    startX: number; startY: number
    startBottom: number; startRight: number
  } | null>(null)
  const didDragRef = useRef(false)

  // Load persisted position after mount
  useEffect(() => {
    setPos(loadPos())
  }, [])

  // Hide widget when a note modal is open (avoids overlap on mobile)
  useEffect(() => {
    const handleOpen = () => setIsHidden(true)
    const handleClose = () => setIsHidden(false)
    window.addEventListener('noteModalOpen', handleOpen)
    window.addEventListener('noteModalClose', handleClose)
    return () => {
      window.removeEventListener('noteModalOpen', handleOpen)
      window.removeEventListener('noteModalClose', handleClose)
    }
  }, [])

  if (isHidden || role === 'contributeur') return null

  const clampPos = (bottom: number, right: number) => ({
    bottom: Math.max(8, Math.min(window.innerHeight - BTN_SIZE - 8, bottom)),
    right: Math.max(8, Math.min(window.innerWidth - BTN_SIZE - 8, right)),
  })

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startBottom: pos.bottom, startRight: pos.right,
    }
    didDragRef.current = false
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    didDragRef.current = true
    setPos(clampPos(dragRef.current.startBottom - dy, dragRef.current.startRight - dx))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    if (didDragRef.current) {
      const newPos = clampPos(
        dragRef.current.startBottom - (e.clientY - dragRef.current.startY),
        dragRef.current.startRight - (e.clientX - dragRef.current.startX),
      )
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos)) } catch {}
    }
    dragRef.current = null
  }

  const handleClick = () => {
    if (didDragRef.current) { didDragRef.current = false; return }
    setIsOpen(v => !v)
    setIsSent(false)
    setMessage('')
    setCategory('')
  }

  const handleSend = async () => {
    if (!message.trim() || !category || isSending) return
    setIsSending(true)
    await fetch('/api/support/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.trim(),
        category,
        userName: userName ?? 'Inconnu',
        userEmail: userEmail ?? 'Non renseigné',
      }),
    })
    setIsSending(false)
    setIsSent(true)
  }

  const canSend = message.trim().length > 0 && category.length > 0

  // Chat window: positioned above and aligned to right edge of button
  const chatBottom = pos.bottom + BTN_SIZE + 12
  const chatRight = pos.right

  return (
    <>
      {/* Floating draggable button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        aria-label="Support"
        style={{
          position: 'fixed',
          bottom: pos.bottom,
          right: pos.right,
          width: BTN_SIZE,
          height: BTN_SIZE,
          borderRadius: '50%',
          background: '#2563EB',
          border: 'none',
          cursor: didDragRef.current ? 'grabbing' : 'pointer',
          boxShadow: '0 4px 20px rgba(37,99,235,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: didDragRef.current ? 'none' : 'transform 0.2s',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!didDragRef.current) e.currentTarget.style.transform = 'scale(1.1)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: chatBottom,
            right: chatRight,
            width: '320px',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            border: '1px solid #E5E7EB',
            zIndex: 9998,
            overflow: 'hidden',
            fontFamily: 'inherit',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: 700,
                color: 'white',
              }}
            >
              M
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>Support Maimoo</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px' }}>On vous répond rapidement</div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '20px' }}>
            {!isSent ? (
              <>
                <div
                  style={{
                    background: '#F3F4F6',
                    borderRadius: '12px 12px 12px 0',
                    padding: '12px 14px',
                    fontSize: '13px',
                    color: '#374151',
                    lineHeight: '1.5',
                    marginBottom: '16px',
                  }}
                >
                  Bonjour {userName?.split(' ')[0] ?? ''} ! Comment pouvons-nous vous aider ?
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: `1.5px solid ${category === cat.id ? '#2563EB' : '#E5E7EB'}`,
                        background: category === cat.id ? '#EFF6FF' : '#ffffff',
                        color: category === cat.id ? '#2563EB' : '#374151',
                        fontSize: '13px',
                        fontWeight: category === cat.id ? 600 : 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Décrivez votre problème ou suggestion..."
                  style={{
                    width: '100%',
                    minHeight: '90px',
                    border: '1.5px solid #E5E7EB',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    color: '#374151',
                    resize: 'none',
                    fontFamily: 'inherit',
                    lineHeight: '1.5',
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: '12px',
                  }}
                  onFocus={e => ((e.target as HTMLTextAreaElement).style.borderColor = '#2563EB')}
                  onBlur={e => ((e.target as HTMLTextAreaElement).style.borderColor = '#E5E7EB')}
                />

                <button
                  onClick={handleSend}
                  disabled={!canSend || isSending}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: canSend ? '#2563EB' : '#E5E7EB',
                    color: canSend ? '#ffffff' : '#9CA3AF',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                  }}
                >
                  {isSending ? 'Envoi...' : 'Envoyer'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#EFF6FF" />
                    <path d="M8 12l3 3 5-5" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0A0A0A', marginBottom: '8px' }}>
                  Message envoyé !
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: '1.5' }}>
                  Merci pour votre retour. Nous vous répondons à{' '}
                  <strong>{userEmail ?? 'votre adresse email'}</strong> dans les plus brefs délais.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: '1px solid #F3F4F6',
              padding: '10px 20px',
              textAlign: 'center',
              fontSize: '11px',
              color: '#9CA3AF',
            }}
          >
            Propulsé par <span style={{ color: '#2563EB', fontWeight: 600 }}>Maimoo</span>
          </div>
        </div>
      )}
    </>
  )
}

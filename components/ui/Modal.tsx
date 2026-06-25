'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-[20px] sm:rounded-2xl w-full sm:max-w-md shadow-xl max-h-[90vh] flex flex-col"
        style={{ animation: 'slideUp 0.25s ease-out' }}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 sm:pt-6 pb-4 shrink-0">
          <h2 className="text-[17px] sm:text-lg font-semibold text-[#1E293B]">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full p-1.5 -mr-1">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 pb-8 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { Menu, ArrowLeft, Plus, Clock } from 'lucide-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'

interface MobileHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  showNewNote?: boolean
  showHistory?: boolean
  onHistory?: () => void
  rightContent?: React.ReactNode
}

export function MobileHeader({
  title,
  showBack = false,
  onBack,
  showNewNote = false,
  showHistory = false,
  onHistory,
  rightContent,
}: MobileHeaderProps) {
  const { toggle } = useMobileSidebar()
  const router = useRouter()

  const handleLeft = () => {
    if (showBack) {
      if (onBack) onBack()
      else router.back()
    } else {
      toggle()
    }
  }

  return (
    <header
      className="lg:hidden"
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#ffffff',
        borderBottom: '1px solid #F3F4F6',
        height: 52,
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        paddingTop: 'env(safe-area-inset-top)',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {/* Burger or back */}
      <button
        onClick={handleLeft}
        style={{
          width: 36, height: 36, borderRadius: 9,
          border: 'none', background: 'none',
          cursor: 'pointer', color: '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {showBack
          ? <ArrowLeft style={{ width: 20, height: 20 }} />
          : <Menu style={{ width: 20, height: 20 }} />
        }
      </button>

      {/* Title */}
      <span style={{
        flex: 1, fontSize: 16, fontWeight: 700, color: '#0A0A0A',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        paddingLeft: 2,
      }}>
        {title}
      </span>

      {/* Right actions */}
      {rightContent}
      {showHistory && (
        <button
          onClick={onHistory}
          style={{
            width: 36, height: 36, borderRadius: 9,
            border: 'none', background: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: '#374151',
          }}
        >
          <Clock style={{ width: 18, height: 18 }} />
        </button>
      )}
      {showNewNote && (
        <button
          onClick={() => router.push('/app/notes/new')}
          style={{
            width: 36, height: 36, borderRadius: 9,
            border: 'none', background: '#2563EB',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Plus style={{ width: 20, height: 20, color: '#ffffff' }} />
        </button>
      )}
    </header>
  )
}

'use client'

import { Menu } from 'lucide-react'
import { useMobileSidebar } from '@/contexts/MobileSidebarContext'

export function BurgerButton() {
  const { toggle } = useMobileSidebar()
  return (
    <button
      onClick={toggle}
      className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-70 shrink-0"
      aria-label="Menu"
    >
      <Menu className="w-5 h-5 text-[#0A1628]" />
    </button>
  )
}

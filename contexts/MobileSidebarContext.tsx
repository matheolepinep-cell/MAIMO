'use client'

import { createContext, useContext, useState } from 'react'

interface MobileSidebarContextType {
  open: boolean
  toggle: () => void
  close: () => void
}

const MobileSidebarContext = createContext<MobileSidebarContextType>({
  open: false,
  toggle: () => {},
  close: () => {},
})

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <MobileSidebarContext.Provider value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}>
      {children}
    </MobileSidebarContext.Provider>
  )
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext)
}

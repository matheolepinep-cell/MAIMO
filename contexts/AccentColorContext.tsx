'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const DEFAULT_COLOR = '#4C6EF5'
const LS_KEY = 'maimoo_accent_color'

type AccentColorContextValue = {
  accentColor: string
  setAccentColor: (color: string) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accentColor: DEFAULT_COLOR,
  setAccentColor: () => {},
})

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accentColor, setColorState] = useState(DEFAULT_COLOR)

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) setColorState(stored)
  }, [])

  const setAccentColor = (color: string) => {
    setColorState(color)
    localStorage.setItem(LS_KEY, color)
  }

  return (
    <AccentColorContext.Provider value={{ accentColor, setAccentColor }}>
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}

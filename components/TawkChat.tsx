'use client'

import { useEffect } from 'react'

interface TawkChatProps {
  userEmail?: string
  userName?: string
  userId?: string
  workspaceName?: string
  role?: string
}

declare global {
  interface Window {
    Tawk_API?: {
      setAttributes: (attrs: Record<string, string>, cb?: () => void) => void
      hideWidget: () => void
      showWidget: () => void
      onLoad?: () => void
    }
    Tawk_LoadStart?: Date
  }
}

export default function TawkChat({
  userEmail,
  userName,
  userId,
  workspaceName,
  role,
}: TawkChatProps) {
  useEffect(() => {
    const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID
    const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID
    if (!propertyId || !widgetId) return

    if (role === 'contributeur') return

    if (!window.Tawk_API) {
      window.Tawk_API = {} as NonNullable<typeof window.Tawk_API>
    }
    window.Tawk_LoadStart = new Date()

    window.Tawk_API.onLoad = () => {
      if (userEmail || userName) {
        window.Tawk_API?.setAttributes({
          name: userName ?? '',
          email: userEmail ?? '',
          userId: userId ?? '',
          workspace: workspaceName ?? '',
        }, () => {})
      }
    }

    const script = document.createElement('script')
    script.async = true
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`
    script.charset = 'UTF-8'
    script.setAttribute('crossorigin', '*')
    document.head.appendChild(script)

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script)
      delete window.Tawk_API
      delete window.Tawk_LoadStart
    }
  }, [userEmail, userName, userId, workspaceName, role])

  return null
}

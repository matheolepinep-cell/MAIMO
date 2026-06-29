import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'Maimoo — La mémoire de votre équipe commerciale',
  description: "Capturez chaque information client en 30 secondes, retrouvez tout en 3 secondes. Notes vocales, recherche IA, partage équipe. L'alternative mobile au CRM pour commerciaux terrain.",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Maimoo',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // iOS 16+: shrinks the layout viewport when the software keyboard opens,
  // so position:fixed;bottom:0 elements naturally stay above the keyboard.
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={GeistSans.className}>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}

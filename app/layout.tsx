import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'MAIMO',
  description: 'La mémoire de ton équipe',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MAIMO',
  },
}

export const viewport: Viewport = {
  themeColor: '#1E2761',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

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
    // Required for Android Chrome standalone mode
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#1E2761',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}

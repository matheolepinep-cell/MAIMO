'use client'

import { Bell } from 'lucide-react'
import { Header } from '@/components/layout/Header'

export default function NotificationsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header title="Notifications" />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
        <Bell className="w-12 h-12 text-gray-200" />
        <p className="text-sm text-[#94A3B8]">Les notifications arrivent bientôt.</p>
      </div>
    </div>
  )
}

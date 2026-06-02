'use client'

import { MessageCircle } from 'lucide-react'
import { Header } from '@/components/layout/Header'

export default function MessagesPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header title="Messages" />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#EFF6FF' }}>
          <MessageCircle className="w-8 h-8" style={{ color: '#3B82F6' }} />
        </div>
        <p className="text-base font-semibold text-[#1E293B]">Messagerie</p>
        <p className="text-sm text-[#94A3B8] text-center max-w-xs">
          La messagerie interne sera disponible prochainement.
        </p>
      </div>
    </div>
  )
}

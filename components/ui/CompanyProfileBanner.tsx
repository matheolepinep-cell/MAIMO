'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'

const DISMISSED_KEY = 'maimo_company_banner_dismissed'

export function CompanyProfileBanner() {
  const router = useRouter()
  const { wsId } = useWorkspace()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return
    if (!wsId) return
    const supabase = createClient()
    supabase
      .from('workspaces')
      .select('company_name')
      .eq('id', wsId)
      .single()
      .then(({ data }) => {
        const ws = data as Record<string, string | null> | null
        if (!ws?.company_name) setShow(true)
      })
  }, [wsId])

  if (!show) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setShow(false)
  }

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: '#FEF9C3', border: '0.5px solid #EAB308', borderRadius: 8 }}>
      <Lightbulb className="w-4 h-4 shrink-0" style={{ color: '#D97706' }} />
      <p className="flex-1 text-[13px] leading-snug" style={{ color: '#92400E' }}>
        Complétez la fiche de votre entreprise pour des réponses IA plus précises et adaptées à votre métier{' '}
        <button
          onClick={() => router.push('/app/settings')}
          className="font-semibold underline hover:opacity-80 transition-opacity"
        >
          Compléter maintenant →
        </button>
      </p>
      <button onClick={handleDismiss} className="shrink-0 transition-colors hover:opacity-70" style={{ color: '#D97706' }}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

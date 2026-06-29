'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, X, Check, Upload, Pencil, Sparkles, LayoutGrid, History } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useRole } from '@/hooks/useRole'

type Step = {
  id: number
  label: string
  desc: string
  icon: React.ElementType
  link: string
}

function getSteps(isContributeur: boolean): Step[] {
  if (isContributeur) {
    return [
      { id: 1, label: 'Découvrez votre espace', desc: 'Explorez votre portefeuille client', icon: LayoutGrid, link: '/app/accounts' },
      { id: 2, label: 'Ajoutez votre première note', desc: 'Notez une information sur un client', icon: Pencil, link: '/app/accounts' },
      { id: 3, label: 'Explorez vos contributions', desc: 'Retrouvez toutes vos saisies', icon: History, link: '/app/accounts' },
    ]
  }
  return [
    { id: 1, label: 'Importez vos clients', desc: 'Importez votre base client existante', icon: Upload, link: '/app/import' },
    { id: 2, label: 'Ajoutez votre première note', desc: 'Créez une note sur un client', icon: Pencil, link: '/app/accounts' },
    { id: 3, label: 'Lancez une recherche IA', desc: 'Posez une question sur vos clients', icon: Sparkles, link: '/app/search' },
  ]
}

export default function OnboardingChecklist() {
  const { profile, loading, refresh } = useUser()
  const role = useRole()
  const router = useRouter()
  const pathname = usePathname()

  const [collapsed, setCollapsed] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const prevStepsLen = useRef(0)

  // Persist collapse state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('onboarding-collapsed')
      if (saved === 'true') setCollapsed(true)
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v
      if (typeof window !== 'undefined') localStorage.setItem('onboarding-collapsed', String(next))
      return next
    })
  }

  // Re-fetch profile when a step is completed elsewhere in the app
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('onboarding:step', handler)
    return () => window.removeEventListener('onboarding:step', handler)
  }, [refresh])

  const stepsCompleted: number[] = (profile?.onboarding_steps_completed as number[] | null) ?? []

  // Celebration when all 3 steps done
  useEffect(() => {
    if (stepsCompleted.length >= 3 && prevStepsLen.current < 3 && !profile?.onboarding_completed) {
      setCelebrating(true)
      const timer = setTimeout(() => {
        fetch('/api/user/onboarding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        }).then(() => refresh())
      }, 3000)
      return () => clearTimeout(timer)
    }
    prevStepsLen.current = stepsCompleted.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsCompleted.length])

  const handleDismiss = async () => {
    await fetch('/api/user/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    })
    refresh()
  }

  const handleStepClick = (step: Step) => {
    if (stepsCompleted.includes(step.id)) return
    // Fire-and-forget audit log for step click
    fetch('/api/user/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_click: step.id }),
    }).catch(() => {})
    if (step.id === 2) {
      router.push('/app/notes/new')
    } else {
      router.push(step.link)
    }
  }

  // Don't render if loading, not logged in, or onboarding already completed
  if (loading || !profile || profile.onboarding_completed) return null

  const steps = getSteps(role === 'contributeur')
  const completedCount = stepsCompleted.length
  const progressPct = Math.round((completedCount / 3) * 100)

  // ── PILL (collapsed) ──
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="fixed z-40 flex items-center gap-2 px-3 py-2 rounded-full text-white text-xs font-semibold shadow-lg"
        style={{ bottom: 96, right: 16, background: '#2563EB', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}
      >
        <Sparkles style={{ width: 13, height: 13 }} />
        Premiers pas {completedCount}/3
      </button>
    )
  }

  // ── FULL CARD ──
  return (
    <div
      className="fixed z-40"
      style={{
        bottom: 96,
        right: 16,
        width: 'min(300px, calc(100vw - 32px))',
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A' }}>
            {celebrating ? '🎉 Félicitations !' : 'Premiers pas 🚀'}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={toggleCollapsed}
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#9CA3AF', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <ChevronDown style={{ width: 14, height: 14 }} />
            </button>
            <button
              onClick={handleDismiss}
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#9CA3AF', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {celebrating ? (
          <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
            Vous maîtrisez les bases ! Bonne utilisation.
          </p>
        ) : (
          <>
            <div style={{ height: 4, background: '#EFF6FF', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
              <div
                style={{ height: '100%', background: '#2563EB', borderRadius: 4, width: `${progressPct}%`, transition: 'width 0.4s ease' }}
              />
            </div>
            <p style={{ fontSize: 12, color: '#6B7280' }}>{completedCount}/3 complétées</p>
          </>
        )}
      </div>

      {/* Steps */}
      {!celebrating && (
        <div style={{ borderTop: '1px solid #F3F4F6', padding: '6px 0' }}>
          {steps.map((step, i) => {
            const done = stepsCompleted.includes(step.id)
            const locked = i > 0 && !stepsCompleted.includes(steps[i - 1].id)
            const Icon = step.icon

            return (
              <button
                key={step.id}
                onClick={() => !done && !locked && handleStepClick(step)}
                disabled={done || locked}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 14px',
                  background: done ? '#F0FDF4' : 'white',
                  border: 'none',
                  cursor: done || locked ? 'default' : 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!done && !locked) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = done ? '#F0FDF4' : 'white' }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: done ? '#DCFCE7' : locked ? '#F9FAFB' : '#EFF6FF',
                  }}
                >
                  {done
                    ? <Check style={{ width: 14, height: 14, color: '#16A34A' }} />
                    : <Icon style={{ width: 14, height: 14, color: locked ? '#D1D5DB' : '#2563EB' }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: done ? '#9CA3AF' : locked ? '#9CA3AF' : '#0A0A0A', textDecoration: done ? 'line-through' : 'none', margin: 0 }}>
                    {step.label}
                  </p>
                  {!done && (
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0, marginTop: 1 }}>{step.desc}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {!celebrating && (
        <div style={{ borderTop: '1px solid #F3F4F6', padding: '8px 14px' }}>
          <button
            onClick={handleDismiss}
            style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Tout masquer
          </button>
        </div>
      )}
    </div>
  )
}

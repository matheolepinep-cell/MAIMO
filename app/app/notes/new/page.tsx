'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Camera, MicOff, Pencil, Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { markOnboardingStep } from '@/lib/onboarding'
import {
  ActionCard,
  AddActionMenu,
  toCleanAction,
  type EditableAction,
  type EditableCreateCompany,
} from '@/components/notes/NoteInput'

type Phase = 'input' | 'analyzing' | 'confirm' | 'executing'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export default function NewNotePage() {
  const router = useRouter()
  const { profile } = useUser()
  const { wsId } = useWorkspace()

  const [activeTab, setActiveTab] = useState<'Texte' | 'Vocal'>('Texte')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [recording, setRecording] = useState(false)
  const [phase, setPhase] = useState<Phase>('input')
  const [pendingActions, setPendingActions] = useState<EditableAction[]>([])
  const [wsAccounts, setWsAccounts] = useState<{ id: string; name: string }[]>([])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [sourceMode, setSourceMode] = useState<'text' | 'vocal'>('text')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSubmitting = phase === 'analyzing' || phase === 'executing'

  const companiesForSelect = [
    ...wsAccounts.map((a) => a.name),
    ...pendingActions
      .filter((a) => a.type === 'create_company')
      .map((a) => (a as EditableCreateCompany).company_name),
  ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i)

  const updateAction = useCallback((id: string, updates: Partial<EditableAction>) => {
    setPendingActions((prev) => prev.map((a) => a.id === id ? { ...a, ...updates } as EditableAction : a))
  }, [])

  const removeAction = useCallback((id: string) => {
    setPendingActions((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const addAction = useCallback((type: EditableAction['type']) => {
    const id = `new-${Date.now()}`
    if (type === 'create_company')
      setPendingActions((p) => [...p, { id, type: 'create_company', company_name: '', city: '', sector: '', status: 'prospect' }])
    else if (type === 'create_contact')
      setPendingActions((p) => [...p, { id, type: 'create_contact', first_name: '', last_name: '', position: '', email: '', phone: '', company_name: '' }])
    else if (type === 'create_calendar_event')
      setPendingActions((p) => [...p, { id, type: 'create_calendar_event', title: '', date: new Date().toISOString().slice(0, 10), start_time: '09:00', end_time: '10:00', company_name: '', enabled: true }])
    else
      setPendingActions((p) => [...p, { id, type: 'create_note', content: '', company_name: '' }])
    setShowAddMenu(false)
  }, [])

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée par ce navigateur."); return }
    const r = new SR()
    r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true
    r.onresult = (e: SpeechRecognitionEvent) => {
      let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setContent(t)
    }
    r.onerror = () => setRecording(false)
    r.onend = () => setRecording(false)
    recognitionRef.current = r; r.start(); setRecording(true)
    setSourceMode('vocal')
  }, [])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
    setRecording(false)
  }, [])

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting || !profile) return
    setSourceMode(activeTab === 'Vocal' ? 'vocal' : 'text')
    setPhase('analyzing')

    try {
      const processRes = await fetch('/api/notes/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, workspaceId: wsId, userId: profile.id }),
      })
      const { actions } = await processRes.json()

      const supabase = createClient()
      const { data: accs } = await supabase
        .from('accounts').select('id, name')
        .eq('company_id', profile.company_id).order('name').limit(100)
      setWsAccounts(accs ?? [])

      const editable: EditableAction[] = (actions ?? []).map((a: Record<string, string | boolean>, i: number) => {
        const id = `a${i}-${Date.now()}`
        if (a.type === 'create_company') return { id, type: 'create_company' as const, company_name: (a.company_name as string) ?? '', city: (a.city as string) ?? '', sector: (a.sector as string) ?? '', status: ((a.status as 'client' | 'prospect') ?? 'prospect') }
        if (a.type === 'create_contact') return { id, type: 'create_contact' as const, first_name: (a.first_name as string) ?? '', last_name: (a.last_name as string) ?? '', position: (a.position as string) ?? '', email: (a.email as string) ?? '', phone: (a.phone as string) ?? '', company_name: (a.company_name as string) ?? '' }
        if (a.type === 'create_calendar_event') return { id, type: 'create_calendar_event' as const, title: (a.title as string) ?? '', date: (a.date as string) ?? new Date().toISOString().slice(0, 10), start_time: (a.start_time as string) ?? '09:00', end_time: (a.end_time as string) ?? '10:00', company_name: (a.company_name as string) ?? '', enabled: a.enabled !== false }
        return { id, type: 'create_note' as const, content: (a.content as string) ?? '', company_name: (a.company_name as string) ?? '' }
      })

      setPendingActions(editable)
      setPhase('confirm')
    } catch {
      setPhase('input')
    }
  }

  const handleExecute = async () => {
    if (!profile) return
    setPhase('executing')
    try {
      await fetch('/api/notes/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: pendingActions.map(toCleanAction),
          workspaceId: wsId,
          userId: profile.id,
          source: sourceMode,
        }),
      })
      markOnboardingStep(2)
      router.push('/app/dashboard')
    } catch {
      setPhase('confirm')
    }
  }

  const handleCancel = () => {
    setPhase('input')
    setPendingActions([])
    setWsAccounts([])
    setShowAddMenu(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#ffffff', borderBottom: '1px solid #F3F4F6',
        padding: '0 16px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={() => router.back()} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#6B7280', fontSize: 14, padding: '8px 0', minWidth: 80,
        }}>
          ← Annuler
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A' }}>Nouvelle note</span>
        <div style={{ minWidth: 80, display: 'flex', justifyContent: 'flex-end' }}>
          {phase === 'input' && (
            <button
              onClick={handleSubmit}
              disabled={!content.trim()}
              style={{
                padding: '8px 16px',
                background: content.trim() ? '#2563EB' : '#E5E7EB',
                color: content.trim() ? '#ffffff' : '#9CA3AF',
                border: 'none', borderRadius: 20,
                fontSize: 14, fontWeight: 600,
                cursor: content.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              Enregistrer
            </button>
          )}
          {isSubmitting && (
            <span style={{
              padding: '8px 16px', borderRadius: 20,
              fontSize: 14, color: '#9CA3AF',
            }}>
              Envoi...
            </span>
          )}
          {phase === 'confirm' && (
            <button
              onClick={handleExecute}
              style={{
                padding: '8px 16px', background: '#2563EB', color: '#ffffff',
                border: 'none', borderRadius: 20,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Confirmer
            </button>
          )}
        </div>
      </header>

      {/* Spinner phases */}
      {isSubmitting && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
        }}>
          <span className="w-10 h-10 border-[3px] border-[#2563EB] border-t-transparent rounded-full animate-spin block" />
          <p style={{ fontSize: 15, color: '#6B7280' }}>
            {phase === 'analyzing' ? 'Analyse en cours…' : 'Enregistrement…'}
          </p>
        </div>
      )}

      {/* Confirm phase */}
      {phase === 'confirm' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 120px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A', margin: '0 0 4px' }}>
                Vérifier les actions
              </p>
              <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
                L&apos;IA a détecté ces actions — modifiez si nécessaire
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {pendingActions.length === 0 && (
                <p style={{ fontSize: 14, color: '#9CA3AF' }}>
                  Aucune action détectée automatiquement.
                </p>
              )}
              {pendingActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  companiesForSelect={companiesForSelect}
                  onUpdate={updateAction}
                  onRemove={removeAction}
                />
              ))}
              <AddActionMenu
                show={showAddMenu}
                onToggle={() => setShowAddMenu((v) => !v)}
                onAdd={addAction}
              />
            </div>
            <button
              onClick={handleExecute}
              style={{
                width: '100%', padding: '14px',
                background: '#2563EB', color: '#ffffff',
                border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
              }}
            >
              Confirmer et enregistrer
            </button>
            <button
              onClick={handleCancel}
              style={{
                width: '100%', padding: '10px', background: 'none', border: 'none',
                fontSize: 13, color: '#9CA3AF', cursor: 'pointer',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Input phase */}
      {phase === 'input' && (
        <>
          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: '#F3F4F6', borderRadius: 12,
            padding: 4, margin: '16px 16px 0',
          }}>
            {(['Texte', 'Vocal'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 9, border: 'none',
                  background: activeTab === tab ? '#ffffff' : 'transparent',
                  color: activeTab === tab ? '#0A0A0A' : '#9CA3AF',
                  fontSize: 14, fontWeight: activeTab === tab ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {tab === 'Texte'
                  ? <><Pencil style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />Texte</>
                  : <><Mic style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />Vocal</>
                }
              </button>
            ))}
          </div>

          {/* Text tab */}
          {activeTab === 'Texte' && (
            <div style={{
              padding: '16px 16px 0',
              maxWidth: 600, margin: '0 auto', width: '100%',
              boxSizing: 'border-box',
            }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre (optionnel — généré automatiquement si vide)"
                style={{
                  width: '100%', padding: '14px 16px',
                  background: '#ffffff', border: '1.5px solid #F3F4F6',
                  borderRadius: 12, fontSize: 15, color: '#0A0A0A',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 12,
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#2563EB' }}
                onBlur={(e) => { e.target.style.borderColor = '#F3F4F6' }}
              />
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                placeholder="Contenu de la note... L'IA détectera automatiquement le client concerné."
                rows={8}
                autoFocus
                style={{
                  width: '100%', padding: '14px 16px',
                  paddingBottom: 80,
                  background: '#ffffff', border: '1.5px solid #F3F4F6',
                  borderRadius: 12, fontSize: 15, color: '#374151',
                  outline: 'none', resize: 'none', boxSizing: 'border-box',
                  lineHeight: 1.7, fontFamily: 'inherit', minHeight: 200,
                }}
                onFocus={(e) => { e.target.style.borderColor = '#2563EB' }}
                onBlur={(e) => { e.target.style.borderColor = '#F3F4F6' }}
              />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 8, padding: '8px 12px',
                background: '#EFF6FF', borderRadius: 8,
              }}>
                <span style={{ fontSize: 12, color: '#2563EB' }}>
                  ✦ L&apos;IA détecte automatiquement le client et indexe la note
                </span>
              </div>
            </div>
          )}

          {/* Vocal tab */}
          {activeTab === 'Vocal' && (
            <div style={{
              padding: '40px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 24,
              maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box',
            }}>
              {content && (
                <div style={{
                  width: '100%', background: '#ffffff', borderRadius: 12,
                  border: '1px solid #F3F4F6', padding: '14px 16px',
                  fontSize: 15, color: '#374151', lineHeight: 1.7, minHeight: 80,
                }}>
                  {content}
                  {recording && (
                    <span className="inline-block w-2 h-4 bg-red-500 ml-1 animate-pulse rounded-sm" />
                  )}
                </div>
              )}

              {!recording ? (
                <button
                  onClick={startRecording}
                  className="hover:scale-105 transition-transform"
                  style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: '#FEF2F2', border: '2px solid #FCA5A5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Mic style={{ width: 32, height: 32, color: '#DC2626' }} />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="animate-pulse"
                  style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: '#DC2626', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <MicOff style={{ width: 32, height: 32, color: 'white' }} />
                </button>
              )}

              <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                {recording
                  ? 'Enregistrement en cours… appuyez pour arrêter'
                  : content
                  ? 'Appuyez sur Enregistrer pour analyser'
                  : 'Appuyez sur le micro pour commencer'}
              </p>
            </div>
          )}

          {/* Fixed bottom action bar */}
          <div
            className="fixed bottom-16 md:bottom-0 left-0 md:left-[200px] right-0"
            style={{
              background: '#ffffff', borderTop: '1px solid #F3F4F6',
              padding: '12px 16px',
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
              display: 'flex', alignItems: 'center', gap: 12, zIndex: 10,
            }}
          >
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: '#F3F4F6', border: 'none',
              borderRadius: 20, cursor: 'pointer', fontSize: 13, color: '#6B7280',
            }}>
              <Paperclip style={{ width: 14, height: 14 }} /> Fichier
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: '#F3F4F6', border: 'none',
              borderRadius: 20, cursor: 'pointer', fontSize: 13, color: '#6B7280',
            }}>
              <Camera style={{ width: 14, height: 14 }} /> Photo
            </button>
            {content.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF' }}>
                {content.length} car.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

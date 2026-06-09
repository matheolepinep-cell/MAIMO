'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, Send, Save, Type, Building2, UserPlus, FileText, Info, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export interface ExecuteResult {
  type: 'create_company' | 'create_contact' | 'create_note'
  created: boolean
  companyId?: string
  companyName?: string
  contactName?: string
  noteId?: string
  accountId?: string | null
}

interface NoteInputProps {
  accountId: string
  accountName?: string
  onSuccess?: (results: ExecuteResult[]) => void
}

type Phase = 'input' | 'analyzing' | 'executing' | 'done'

declare global {
  interface Window { SpeechRecognition: typeof SpeechRecognition; webkitSpeechRecognition: typeof SpeechRecognition }
}

function ResultIcon({ type, created }: { type: string; created: boolean }) {
  if (!created) return <Info className="w-4 h-4 shrink-0" style={{ color: '#8899BB' }} />
  if (type === 'create_company') return <Building2 className="w-4 h-4 shrink-0" style={{ color: '#4C6EF5' }} />
  if (type === 'create_contact') return <UserPlus className="w-4 h-4 shrink-0" style={{ color: '#4C6EF5' }} />
  return <FileText className="w-4 h-4 shrink-0" style={{ color: '#4C6EF5' }} />
}

export function NoteInput({ accountId, accountName, onSuccess }: NoteInputProps) {
  const router = useRouter()
  const { profile } = useUser()
  const { wsId } = useWorkspace()

  const [mode, setMode] = useState<'text' | 'vocal'>('text')
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [phase, setPhase] = useState<Phase>('input')
  const [summary, setSummary] = useState<string[]>([])
  const [results, setResults] = useState<ExecuteResult[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const handleSave = useCallback(async (inputText: string, inputMode: 'text' | 'vocal') => {
    if (!inputText.trim() || !profile) return
    setPhase('analyzing')

    try {
      const processRes = await fetch('/api/notes/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, workspaceId: wsId, userId: profile.id, companyId: accountId }),
      })
      const { actions } = await processRes.json()

      setPhase('executing')

      const executeRes = await fetch('/api/notes/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions, workspaceId: wsId, userId: profile.id, companyId: accountId, source: inputMode }),
      })
      const { results: execResults, summary: execSummary } = await executeRes.json()

      setSummary(execSummary ?? [])
      setResults(execResults ?? [])
      setPhase('done')
      onSuccess?.(execResults ?? [])
    } catch {
      setPhase('input')
    }
  }, [profile, wsId, accountId, onSuccess])

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée par ce navigateur."); return }
    const r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true
    r.onresult = (e: SpeechRecognitionEvent) => {
      let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setText(t)
    }
    r.onerror = () => setRecording(false)
    r.onend = () => setRecording(false)
    recognitionRef.current = r; r.start(); setRecording(true); setMode('vocal')
  }, [])

  const stopRecording = useCallback(() => { recognitionRef.current?.stop(); setRecording(false) }, [])

  const handleReset = () => { setText(''); setPhase('input'); setSummary([]); setResults([]) }

  const createdCompany = results.find((r) => r.type === 'create_company')

  /* ── Done state ── */
  if (phase === 'done') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-7 h-7" style={{ color: '#22C55E' }} />
          <p className="font-semibold text-[#1E293B]">Actions effectuées</p>
        </div>
        <div className="space-y-2.5">
          {results.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">Aucune action détectée.</p>
          ) : results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-[#334155]">
              <ResultIcon type={r.type} created={r.created} />
              <span>{summary[i] ?? ''}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          {createdCompany?.companyId && (
            <button
              onClick={() => router.push(`/app/accounts/${createdCompany.companyId}`)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: '#1E2761' }}
            >
              Voir la fiche →
            </button>
          )}
          <button
            onClick={handleReset}
            className={clsx(
              'py-2.5 rounded-xl text-sm font-semibold transition-all',
              createdCompany?.companyId
                ? 'flex-1 border border-gray-200 text-[#64748B] hover:bg-gray-50'
                : 'w-full text-[#1E2761]'
            )}
            style={createdCompany?.companyId ? {} : { background: '#EEF2FF' }}
          >
            Nouvelle note
          </button>
        </div>
      </div>
    )
  }

  /* ── Loading state ── */
  if (phase === 'analyzing' || phase === 'executing') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#1E2761] border-t-transparent rounded-full animate-spin shrink-0" />
        <p className="text-sm text-[#64748B]">
          {phase === 'analyzing' ? 'Analyse en cours…' : 'Exécution des actions…'}
        </p>
      </div>
    )
  }

  /* ── Input state ── */
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex gap-2 mb-3">
        {(['text', 'vocal'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
              mode === m ? 'bg-[#1E2761] text-white' : 'text-[#64748B] hover:bg-gray-100'
            )}>
            {m === 'text' ? <><Type className="w-3.5 h-3.5" />Texte</> : <><Mic className="w-3.5 h-3.5" />Vocal</>}
          </button>
        ))}
      </div>

      {mode === 'text' ? (
        <form onSubmit={(e) => { e.preventDefault(); handleSave(text, 'text') }} className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Saisir une note ou une instruction…"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150" />
          <button type="submit" disabled={!text.trim()}
            className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: '#1E2761' }}>
            <Send className="w-3.5 h-3.5" />Enregistrer
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          {text && (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-[#1E293B] min-h-[60px]">
              {text}
              {recording && <span className="inline-block w-2 h-4 bg-red-500 ml-1 animate-pulse rounded-sm" />}
            </div>
          )}
          {!recording ? (
            <button onClick={startRecording}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-500 font-medium text-sm hover:bg-red-100 transition-all duration-150">
              <Mic className="w-5 h-5" />Démarrer l&apos;enregistrement
            </button>
          ) : (
            <button onClick={stopRecording}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 animate-pulse">
              <MicOff className="w-5 h-5" />Arrêter l&apos;enregistrement
            </button>
          )}
          {text.trim() && !recording && (
            <button onClick={() => handleSave(text, 'vocal')}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all"
              style={{ background: '#1E2761', borderRadius: 10, height: 44 }}>
              <Save className="w-4 h-4" />
              Enregistrer la note
            </button>
          )}
        </div>
      )}
    </div>
  )
}

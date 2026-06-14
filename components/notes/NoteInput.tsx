'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, Send, Save, Type, Building2, UserPlus, FileText, Info, CheckCircle2, Trash2, Plus, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

/* ─── Shared types (exported for dashboard modal reuse) ─── */
export interface ExecuteResult {
  type: 'create_company' | 'create_contact' | 'create_note'
  created: boolean
  companyId?: string
  companyName?: string
  contactName?: string
  noteId?: string
  accountId?: string | null
}

export interface EditableCreateCompany {
  id: string; type: 'create_company'
  company_name: string; city: string; sector: string; status: 'client' | 'prospect'
}
export interface EditableCreateContact {
  id: string; type: 'create_contact'
  first_name: string; last_name: string; position: string; email: string; phone: string; company_name: string
}
export interface EditableCreateNote {
  id: string; type: 'create_note'
  content: string; company_name: string
}
export type EditableAction = EditableCreateCompany | EditableCreateContact | EditableCreateNote
type ActionType = EditableAction['type']

interface NoteInputProps {
  accountId: string
  accountName?: string
  onSuccess?: (results: ExecuteResult[]) => void
}

type Phase = 'input' | 'analyzing' | 'confirm' | 'executing' | 'done'

declare global {
  interface Window { SpeechRecognition: typeof SpeechRecognition; webkitSpeechRecognition: typeof SpeechRecognition }
}

/* ─── Helpers ─── */
const inputCls = 'w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] focus:border-transparent transition-all'

export function toCleanAction(a: EditableAction): Record<string, unknown> {
  if (a.type === 'create_company') return { type: 'create_company', company_name: a.company_name, city: a.city, sector: a.sector, status: a.status }
  if (a.type === 'create_contact') return { type: 'create_contact', first_name: a.first_name, last_name: a.last_name, position: a.position, email: a.email, phone: a.phone, company_name: a.company_name }
  return { type: 'create_note', content: a.content, company_name: a.company_name }
}

function actionLabel(type: ActionType) {
  if (type === 'create_company') return 'Créer une fiche entreprise'
  if (type === 'create_contact') return 'Ajouter un contact'
  return 'Créer une note'
}

function ActionTypeIcon({ type }: { type: ActionType }) {
  if (type === 'create_company') return <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#0A0A0A' }} />
  if (type === 'create_contact') return <UserPlus className="w-3.5 h-3.5 shrink-0" style={{ color: '#0A0A0A' }} />
  return <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: '#0A0A0A' }} />
}

function ResultIcon({ type, created }: { type: string; created: boolean }) {
  if (!created) return <Info className="w-4 h-4 shrink-0" style={{ color: '#6B6B6B' }} />
  if (type === 'create_company') return <Building2 className="w-4 h-4 shrink-0" style={{ color: '#0A0A0A' }} />
  if (type === 'create_contact') return <UserPlus className="w-4 h-4 shrink-0" style={{ color: '#0A0A0A' }} />
  return <FileText className="w-4 h-4 shrink-0" style={{ color: '#0A0A0A' }} />
}

/* ─── Editable action card ─── */
interface ActionCardProps {
  action: EditableAction
  companiesForSelect: string[]
  onUpdate: (id: string, updates: Partial<EditableAction>) => void
  onRemove: (id: string) => void
}

export function ActionCard({ action, companiesForSelect, onUpdate, onRemove }: ActionCardProps) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-2.5" style={{ background: '#FAFBFF' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ActionTypeIcon type={action.type} />
          <span className="text-xs font-semibold text-[#334155]">{actionLabel(action.type)}</span>
        </div>
        <button onClick={() => onRemove(action.id)}
          className="p-1 rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {action.type === 'create_company' && (
        <>
          <input value={action.company_name} onChange={(e) => onUpdate(action.id, { company_name: e.target.value })}
            placeholder="Nom de l'entreprise" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={action.city} onChange={(e) => onUpdate(action.id, { city: e.target.value })}
              placeholder="Ville" className={inputCls} />
            <input value={action.sector} onChange={(e) => onUpdate(action.id, { sector: e.target.value })}
              placeholder="Secteur" className={inputCls} />
          </div>
          <div className="flex gap-2">
            {(['prospect', 'client'] as const).map((s) => (
              <button key={s} type="button" onClick={() => onUpdate(action.id, { status: s })}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={action.status === s ? { background: '#0A0A0A', color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
                {s === 'client' ? 'Client' : 'Prospect'}
              </button>
            ))}
          </div>
        </>
      )}

      {action.type === 'create_contact' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input value={action.first_name} onChange={(e) => onUpdate(action.id, { first_name: e.target.value })}
              placeholder="Prénom" className={inputCls} />
            <input value={action.last_name} onChange={(e) => onUpdate(action.id, { last_name: e.target.value })}
              placeholder="Nom" className={inputCls} />
          </div>
          <input value={action.position} onChange={(e) => onUpdate(action.id, { position: e.target.value })}
            placeholder="Poste" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={action.email} onChange={(e) => onUpdate(action.id, { email: e.target.value })}
              placeholder="Email" type="email" className={inputCls} />
            <input value={action.phone} onChange={(e) => onUpdate(action.id, { phone: e.target.value })}
              placeholder="Téléphone" className={inputCls} />
          </div>
          <input value={action.company_name} onChange={(e) => onUpdate(action.id, { company_name: e.target.value })}
            list={`companies-${action.id}`} placeholder="Entreprise" className={inputCls} />
          <datalist id={`companies-${action.id}`}>
            {companiesForSelect.map((n) => <option key={n} value={n} />)}
          </datalist>
        </>
      )}

      {action.type === 'create_note' && (
        <>
          <textarea value={action.content} onChange={(e) => onUpdate(action.id, { content: e.target.value })}
            placeholder="Contenu de la note" rows={3}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] focus:border-transparent transition-all resize-none" />
          <input value={action.company_name} onChange={(e) => onUpdate(action.id, { company_name: e.target.value })}
            list={`companies-note-${action.id}`} placeholder="Entreprise" className={inputCls} />
          <datalist id={`companies-note-${action.id}`}>
            {companiesForSelect.map((n) => <option key={n} value={n} />)}
          </datalist>
        </>
      )}
    </div>
  )
}

/* ─── Add action dropdown ─── */
interface AddActionMenuProps {
  show: boolean
  onToggle: () => void
  onAdd: (type: ActionType) => void
}

export function AddActionMenu({ show, onToggle, onAdd }: AddActionMenuProps) {
  return (
    <div className="relative">
      <button onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors py-1">
        <Plus className="w-3.5 h-3.5" />Ajouter une action<ChevronDown className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute top-full left-0 z-20 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
          {([
            { type: 'create_company' as ActionType, label: 'Fiche entreprise', Icon: Building2 },
            { type: 'create_contact' as ActionType, label: 'Contact', Icon: UserPlus },
            { type: 'create_note' as ActionType, label: 'Note', Icon: FileText },
          ]).map(({ type, label, Icon }) => (
            <button key={type} onClick={() => onAdd(type)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#334155] hover:bg-[#F5F5F5] transition-colors whitespace-nowrap">
              <Icon className="w-3.5 h-3.5" style={{ color: '#0A0A0A' }} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Main component ─── */
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
  const [pendingActions, setPendingActions] = useState<EditableAction[]>([])
  const [sourceMode, setSourceMode] = useState<'text' | 'vocal'>('text')
  const [originalText, setOriginalText] = useState('')
  const [wsAccounts, setWsAccounts] = useState<{ id: string; name: string }[]>([])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const companiesForSelect = [
    ...wsAccounts.map((a) => a.name),
    ...pendingActions.filter((a) => a.type === 'create_company').map((a) => (a as EditableCreateCompany).company_name),
  ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i)

  const updateAction = useCallback((id: string, updates: Partial<EditableAction>) => {
    setPendingActions((prev) => prev.map((a) => a.id === id ? { ...a, ...updates } as EditableAction : a))
  }, [])

  const removeAction = useCallback((id: string) => {
    setPendingActions((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const addAction = useCallback((type: ActionType) => {
    const id = `new-${Date.now()}`
    const base = accountName ?? ''
    if (type === 'create_company') setPendingActions((p) => [...p, { id, type, company_name: '', city: '', sector: '', status: 'prospect' }])
    else if (type === 'create_contact') setPendingActions((p) => [...p, { id, type, first_name: '', last_name: '', position: '', email: '', phone: '', company_name: base }])
    else setPendingActions((p) => [...p, { id, type, content: '', company_name: base }])
    setShowAddMenu(false)
  }, [accountName])

  const handleSave = useCallback(async (inputText: string, inputMode: 'text' | 'vocal') => {
    if (!inputText.trim() || !profile) return
    setPhase('analyzing')
    setSourceMode(inputMode)
    setOriginalText(inputText)

    try {
      const processRes = await fetch('/api/notes/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, workspaceId: wsId, userId: profile.id, companyId: accountId }),
      })
      const { actions } = await processRes.json()

      const supabase = createClient()
      const { data: accs } = await supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name').limit(100)
      setWsAccounts(accs ?? [])

      const editable: EditableAction[] = (actions ?? []).map((a: Record<string, string>, i: number) => {
        const id = `a${i}-${Date.now()}`
        if (a.type === 'create_company') return { id, type: 'create_company', company_name: a.company_name ?? '', city: a.city ?? '', sector: a.sector ?? '', status: (a.status as 'client' | 'prospect') ?? 'prospect' }
        if (a.type === 'create_contact') return { id, type: 'create_contact', first_name: a.first_name ?? '', last_name: a.last_name ?? '', position: a.position ?? '', email: a.email ?? '', phone: a.phone ?? '', company_name: a.company_name ?? '' }
        return { id, type: 'create_note' as const, content: a.content ?? '', company_name: a.company_name ?? '' }
      })

      setPendingActions(editable)
      setPhase('confirm')
    } catch {
      setPhase('input')
    }
  }, [profile, wsId, accountId])

  const handleExecute = useCallback(async () => {
    if (!profile) return
    setPhase('executing')
    try {
      const executeRes = await fetch('/api/notes/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: pendingActions.map(toCleanAction), workspaceId: wsId, userId: profile.id, companyId: accountId, source: sourceMode }),
      })
      const { results: execResults, summary: execSummary } = await executeRes.json()
      setSummary(execSummary ?? [])
      setResults(execResults ?? [])
      setPhase('done')
      onSuccess?.(execResults ?? [])
    } catch {
      setPhase('confirm')
    }
  }, [profile, wsId, accountId, sourceMode, pendingActions, onSuccess])

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée par ce navigateur."); return }
    const r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true
    r.onresult = (e: SpeechRecognitionEvent) => {
      let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(t)
    }
    r.onerror = () => setRecording(false); r.onend = () => setRecording(false)
    recognitionRef.current = r; r.start(); setRecording(true); setMode('vocal')
  }, [])

  const stopRecording = useCallback(() => { recognitionRef.current?.stop(); setRecording(false) }, [])

  const handleReset = () => {
    setText(''); setPhase('input'); setSummary([]); setResults([])
    setPendingActions([]); setOriginalText(''); setWsAccounts([])
  }

  const handleCancel = () => {
    setText(originalText); setPhase('input'); setPendingActions([]); setWsAccounts([]); setShowAddMenu(false)
  }

  const createdCompany = results.find((r) => r.type === 'create_company')

  /* ── Done ── */
  if (phase === 'done') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-7 h-7" style={{ color: '#22C55E' }} />
          <p className="font-semibold text-[#1E293B]">Actions effectuées</p>
        </div>
        <div className="space-y-2.5">
          {results.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">Aucune action effectuée.</p>
          ) : results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-[#334155]">
              <ResultIcon type={r.type} created={r.created} />
              <span>{summary[i] ?? ''}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          {createdCompany?.companyId && (
            <button onClick={() => router.push(`/app/accounts/${createdCompany.companyId}`)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#0A0A0A' }}>
              Voir la fiche →
            </button>
          )}
          <button onClick={handleReset}
            className={clsx('py-2.5 rounded-xl text-sm font-semibold transition-all', createdCompany?.companyId ? 'flex-1 border border-gray-200 text-[#64748B] hover:bg-gray-50' : 'w-full text-[#0A0A0A]')}
            style={createdCompany?.companyId ? {} : { background: '#F5F5F5' }}>
            Nouvelle note
          </button>
        </div>
      </div>
    )
  }

  /* ── Analyzing / Executing ── */
  if (phase === 'analyzing' || phase === 'executing') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#0A0A0A] border-t-transparent rounded-full animate-spin shrink-0" />
        <p className="text-sm text-[#64748B]">
          {phase === 'analyzing' ? 'Analyse du texte en cours…' : 'Exécution des actions…'}
        </p>
      </div>
    )
  }

  /* ── Confirm ── */
  if (phase === 'confirm') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div>
          <p className="text-[15px] font-bold text-[#1E293B]">Vérifier les actions</p>
          <p className="text-[12px] text-[#6B6B6B] mt-0.5">L&apos;IA a détecté ces actions — modifiez si nécessaire</p>
        </div>

        <div className="space-y-3">
          {pendingActions.length === 0 && (
            <p className="text-sm text-[#94A3B8] py-1">Aucune action détectée automatiquement.</p>
          )}
          {pendingActions.map((action) => (
            <ActionCard key={action.id} action={action} companiesForSelect={companiesForSelect}
              onUpdate={updateAction} onRemove={removeAction} />
          ))}
          <AddActionMenu show={showAddMenu} onToggle={() => setShowAddMenu((v) => !v)} onAdd={addAction} />
        </div>

        <div className="space-y-2 pt-1">
          <button onClick={handleExecute}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: '#0A0A0A' }}>
            Confirmer et enregistrer
          </button>
          <button onClick={handleCancel}
            className="w-full py-1.5 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors text-center">
            Annuler
          </button>
        </div>
      </div>
    )
  }

  /* ── Input ── */
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex gap-2 mb-3">
        {(['text', 'vocal'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150', mode === m ? 'bg-[#0A0A0A] text-white' : 'text-[#64748B] hover:bg-gray-100')}>
            {m === 'text' ? <><Type className="w-3.5 h-3.5" />Texte</> : <><Mic className="w-3.5 h-3.5" />Vocal</>}
          </button>
        ))}
      </div>

      {mode === 'text' ? (
        <form onSubmit={(e) => { e.preventDefault(); handleSave(text, 'text') }} className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Saisir une note ou une instruction…" rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150" />
          <button type="submit" disabled={!text.trim()}
            className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: '#0A0A0A' }}>
            <Send className="w-3.5 h-3.5" />Enregistrer
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          {text && (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-[#1E293B] min-h-[60px]">
              {text}{recording && <span className="inline-block w-2 h-4 bg-red-500 ml-1 animate-pulse rounded-sm" />}
            </div>
          )}
          {!recording ? (
            <button onClick={startRecording} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-500 font-medium text-sm hover:bg-red-100 transition-all duration-150">
              <Mic className="w-5 h-5" />Démarrer l&apos;enregistrement
            </button>
          ) : (
            <button onClick={stopRecording} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 animate-pulse">
              <MicOff className="w-5 h-5" />Arrêter l&apos;enregistrement
            </button>
          )}
          {text.trim() && !recording && (
            <button onClick={() => handleSave(text, 'vocal')}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all"
              style={{ background: '#0A0A0A', borderRadius: 10, height: 44 }}>
              <Save className="w-4 h-4" />Enregistrer la note
            </button>
          )}
        </div>
      )}
    </div>
  )
}

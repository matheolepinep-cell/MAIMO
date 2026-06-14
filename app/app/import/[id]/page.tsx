'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronUp, AlertTriangle, Check, Loader2,
  Building2, Phone, Mail, FileText, User, GitMerge, RefreshCw
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'

type MaimoField = 'company_name' | 'city' | 'industry' | 'status' | 'contact_name' | 'contact_role' | 'contact_phone' | 'contact_email' | 'revenue' | 'notes'
type Mapping = Record<MaimoField, string | null>
type AnalyzedRow = Record<MaimoField, string> & {
  note_generated: string
  _raw: Record<string, unknown>
  _duplicate_of: string | null
}

const FIELD_LABELS: Record<MaimoField, string> = {
  company_name: 'Nom entreprise',
  city: 'Ville',
  industry: 'Secteur',
  status: 'Statut',
  contact_name: 'Contact',
  contact_role: 'Poste',
  contact_phone: 'Téléphone',
  contact_email: 'Email',
  revenue: 'CA estimé',
  notes: 'Notes',
}
const MAIMO_FIELDS = Object.keys(FIELD_LABELS) as MaimoField[]

type ResultPayload = {
  mapping: Mapping
  analyzed_rows: AnalyzedRow[]
  warnings: string[]
  processed: number
  total_rows: number
}

type ImportRecord = {
  id: string
  file_name: string
  status: string
  preview: { headers: string[]; total_rows: number }
  result: ResultPayload | null
}

const ANALYSIS_BATCH = 20
const EXECUTE_BATCH = 20

// ── Reusable progress card ──────────────────────────────────────────────────
function ProgressCard({
  title, subtitle, current, total, error, onResume, resumeLabel,
}: {
  title: string; subtitle?: string
  current: number; total: number
  error?: string; onResume?: () => void; resumeLabel?: string
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="rounded-2xl p-6 text-center"
      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
      {error ? (
        <>
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0F172A] mb-1">{title}</p>
          <p className="text-xs text-slate-400 mb-5">{error}</p>
          {onResume && (
            <Button onClick={onResume} size="sm" className="w-full">
              <RefreshCw className="w-3.5 h-3.5 mr-2" />{resumeLabel ?? 'Reprendre'}
            </Button>
          )}
        </>
      ) : (
        <>
          <Loader2 className="w-10 h-10 text-[#0A0A0A] animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-[#0F172A] mb-1">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 mb-2">{subtitle}</p>}
          <p className="text-2xl font-bold text-[#0A0A0A] my-3">
            {current} <span className="text-slate-400 text-base font-normal">/ {total}</span>
          </p>
          <div className="w-full rounded-full h-2 mb-2 overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
            <div className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0A0A0A, #0A0A0A)' }} />
          </div>
          <p className="text-xs text-slate-400">{pct}%</p>
        </>
      )}
    </div>
  )
}

export default function ImportValidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile } = useUser()
  const { wsId } = useWorkspace()

  // ── Initial load ──
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(null)
  const [loadError, setLoadError] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)

  // ── Analysis batches ──
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const [analysisResumeOffset, setAnalysisResumeOffset] = useState<number | null>(null)
  const isAnalyzingRef = useRef(false)
  const didStartAnalysisRef = useRef(false)

  // ── Validation state ──
  const [mapping, setMapping] = useState<Mapping>({} as Mapping)
  const [rows, setRows] = useState<AnalyzedRow[]>([])
  const [editedNotes, setEditedNotes] = useState<Record<number, string>>({})
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [mappingOpen, setMappingOpen] = useState(false)

  // ── Execute batches ──
  const [execStatus, setExecStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [execProgress, setExecProgress] = useState({ current: 0, total: 0 })
  const [execError, setExecError] = useState('')
  const [execResumeOffset, setExecResumeOffset] = useState<number | null>(null)
  const [execTotals, setExecTotals] = useState({ created: 0, merged: 0, skipped: 0, contacts: 0, notes: 0 })
  const execIndicesRef = useRef<number[]>([])
  const isExecutingRef = useRef(false)

  // ── Run analysis batches ──
  const runAnalysis = useCallback(async (totalRows: number, startOffset: number, companyId: string) => {
    if (isAnalyzingRef.current) return
    isAnalyzingRef.current = true
    setAnalysisStatus('running')
    setAnalysisError('')

    let offset = startOffset
    while (offset < totalRows) {
      setAnalysisProgress({ current: offset, total: totalRows })
      let res: Response
      try {
        res = await fetch('/api/import/analyze-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import_id: id, offset, limit: ANALYSIS_BATCH, company_id: companyId }),
        })
      } catch {
        isAnalyzingRef.current = false
        setAnalysisResumeOffset(offset)
        setAnalysisStatus('error')
        setAnalysisError(`Erreur réseau au batch ${offset}.`)
        return
      }
      if (!res.ok) {
        isAnalyzingRef.current = false
        setAnalysisResumeOffset(offset)
        setAnalysisStatus('error')
        setAnalysisError(`Erreur serveur au batch ${offset}. Cliquez pour reprendre.`)
        return
      }
      const data = await res.json()
      setAnalysisProgress({ current: data.processed, total: totalRows })
      if (data.next_offset === null) break
      offset = data.next_offset
    }

    // Reload from DB once done
    const supabase = createClient()
    const { data: updated } = await supabase.from('bulk_imports').select('*').eq('id', id).single()
    if (updated) {
      const record = updated as ImportRecord
      setImportRecord(record)
      const result = record.result
      if (result) {
        setMapping(result.mapping ?? ({} as Mapping))
        setRows(result.analyzed_rows ?? [])
        setSelectedIndices(new Set((result.analyzed_rows ?? []).map((_, i) => i)))
      }
    }

    isAnalyzingRef.current = false
    setAnalysisStatus('done')
  }, [id])

  // ── Run execute batches ──
  const runExecute = useCallback(async (selectedIdxs: number[], startOffset: number, companyId: string) => {
    if (isExecutingRef.current) return
    isExecutingRef.current = true
    setExecStatus('running')
    setExecError('')

    const total = selectedIdxs.length
    let offset = startOffset
    let totCreated = execTotals.created
    let totMerged = execTotals.merged
    let totSkipped = execTotals.skipped
    let totContacts = execTotals.contacts
    let totNotes = execTotals.notes

    while (offset < total) {
      setExecProgress({ current: offset, total })

      let res: Response
      try {
        res = await fetch('/api/import/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            import_id: id,
            selected_indices: selectedIdxs,
            company_id: companyId,
            workspace_id: wsId ?? null,
            offset,
            limit: EXECUTE_BATCH,
          }),
        })
      } catch {
        isExecutingRef.current = false
        setExecResumeOffset(offset)
        setExecStatus('error')
        setExecError(`Erreur réseau à la fiche ${offset}. Cliquez pour reprendre.`)
        return
      }

      if (!res.ok) {
        isExecutingRef.current = false
        setExecResumeOffset(offset)
        setExecStatus('error')
        setExecError(`Erreur serveur à la fiche ${offset}. Cliquez pour reprendre.`)
        return
      }

      const data = await res.json()
      totCreated += data.created
      totMerged += data.merged
      totSkipped += data.skipped
      totContacts += data.contacts_created
      totNotes += data.notes_created

      setExecProgress({ current: data.processed, total })
      setExecTotals({ created: totCreated, merged: totMerged, skipped: totSkipped, contacts: totContacts, notes: totNotes })

      if (data.done) break
      offset = data.next_offset
    }

    isExecutingRef.current = false
    setExecStatus('done')
    router.push(
      `/app/import/${id}/done?created=${totCreated}&merged=${totMerged}&skipped=${totSkipped}&contacts=${totContacts}&notes=${totNotes}`
    )
  }, [id, router, execTotals])

  // ── Initial load ──
  useEffect(() => {
    const supabase = createClient()
    supabase.from('bulk_imports').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error || !data) { setLoadError('Import introuvable.'); setInitialLoading(false); return }
        const record = data as ImportRecord
        setImportRecord(record)
        setInitialLoading(false)

        if (record.status === 'review' || record.status === 'done') {
          const result = record.result
          if (result) {
            setMapping(result.mapping ?? ({} as Mapping))
            setRows(result.analyzed_rows ?? [])
            setSelectedIndices(new Set((result.analyzed_rows ?? []).map((_, i) => i)))
          }
          setAnalysisStatus('done')
        }
        // 'parsed' or 'analyzing' → auto-start via next effect
      })
  }, [id])

  // ── Auto-start analysis if needed ──
  useEffect(() => {
    if (didStartAnalysisRef.current) return
    if (!importRecord || !profile) return
    if (importRecord.status === 'review' || importRecord.status === 'done') return

    didStartAnalysisRef.current = true
    const totalRows = importRecord.preview?.total_rows ?? 0
    const alreadyProcessed = importRecord.result?.processed ?? 0
    setAnalysisProgress({ current: alreadyProcessed, total: totalRows })
    runAnalysis(totalRows, alreadyProcessed, profile.company_id)
  }, [importRecord, profile, runAnalysis])

  // ── Validation handlers ──
  const toggleRow = useCallback((idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const toggleAll = () => {
    if (selectedIndices.size === rows.length) setSelectedIndices(new Set())
    else setSelectedIndices(new Set(rows.map((_, i) => i)))
  }

  const handleImport = async () => {
    if (!profile || selectedIndices.size === 0) return

    // Merge edited notes back into DB so execute can read them
    const finalRows = rows.map((row, i) => ({
      ...row,
      note_generated: editedNotes[i] ?? row.note_generated,
    }))
    const supabase = createClient()
    await supabase.from('bulk_imports').update({
      result: { ...(importRecord?.result ?? {}), analyzed_rows: finalRows },
    }).eq('id', id)

    const selectedIdxs = Array.from(selectedIndices).sort((a, b) => a - b)
    execIndicesRef.current = selectedIdxs
    setExecTotals({ created: 0, merged: 0, skipped: 0, contacts: 0, notes: 0 })
    setExecProgress({ current: 0, total: selectedIdxs.length })
    runExecute(selectedIdxs, 0, profile.company_id)
  }

  // ── Render guards ──
  if (initialLoading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Validation" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#0A0A0A] animate-spin" />
        </div>
      </div>
    )
  }

  if (loadError || !importRecord) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Import" />
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-[#0F172A] font-medium">{loadError || 'Données introuvables.'}</p>
            <button onClick={() => router.push('/app/import')} className="mt-4 text-sm text-[#0A0A0A] hover:underline">
              Recommencer →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Analysis progress ──
  if (analysisStatus !== 'done') {
    const totalRows = importRecord.preview?.total_rows ?? 0
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Analyse en cours…" />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm">
            <Breadcrumb items={[
              { label: 'MAIMOO', href: '/app/dashboard' },
              { label: 'Importer', href: '/app/import' },
              { label: 'Analyse' },
            ]} />
            <ProgressCard
              title="Analyse IA en cours…"
              subtitle="Chaque lot prend 3-5 secondes"
              current={analysisProgress.current}
              total={analysisProgress.total || totalRows}
              error={analysisStatus === 'error' ? analysisError : undefined}
              onResume={analysisStatus === 'error' && analysisResumeOffset !== null && profile
                ? () => runAnalysis(totalRows, analysisResumeOffset, profile.company_id)
                : undefined}
              resumeLabel={`Reprendre depuis ${analysisResumeOffset}`}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Execute progress ──
  if (execStatus === 'running' || execStatus === 'error') {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Import en cours…" />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm">
            <Breadcrumb items={[
              { label: 'MAIMOO', href: '/app/dashboard' },
              { label: 'Importer', href: '/app/import' },
              { label: 'Import' },
            ]} />
            <ProgressCard
              title="Import en cours…"
              subtitle={execTotals.created + execTotals.merged > 0
                ? `${execTotals.created} créées · ${execTotals.merged} fusionnées`
                : undefined}
              current={execProgress.current}
              total={execProgress.total}
              error={execStatus === 'error' ? execError : undefined}
              onResume={execStatus === 'error' && execResumeOffset !== null && profile
                ? () => runExecute(execIndicesRef.current, execResumeOffset, profile.company_id)
                : undefined}
              resumeLabel={`Reprendre depuis la fiche ${execResumeOffset}`}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Validation UI ──
  const allColumns = rows[0]?._raw ? Object.keys(rows[0]._raw) : []
  const contactCount = rows.filter((r) => r.contact_name?.trim()).length
  const duplicateCount = rows.filter((r) => r._duplicate_of).length
  const warnings = importRecord.result?.warnings ?? []

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Validation de l'import" />

      <div className="flex-1 pb-32">
        <div className="p-4 md:p-8 max-w-3xl mx-auto">

          <Breadcrumb items={[
            { label: 'MAIMOO', href: '/app/dashboard' },
            { label: 'Importer', href: '/app/import' },
            { label: 'Validation' },
          ]} />

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Validation de l'import</h1>
            <p className="text-slate-500 text-sm mt-1 truncate">{importRecord.file_name}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full text-[#0A0A0A]"
                style={{ background: 'rgba(0,0,0,0.06)' }}>
                {rows.length} entreprise{rows.length !== 1 ? 's' : ''} détectée{rows.length !== 1 ? 's' : ''}
              </span>
              {contactCount > 0 && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full text-emerald-700"
                  style={{ background: 'rgba(16,185,129,0.1)' }}>
                  {contactCount} contact{contactCount !== 1 ? 's' : ''}
                </span>
              )}
              {duplicateCount > 0 && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full text-amber-700"
                  style={{ background: 'rgba(245,158,11,0.1)' }}>
                  {duplicateCount} doublon{duplicateCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-xl p-4 mb-5 flex items-start gap-3"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>{warnings.map((w, i) => <p key={i} className="text-sm text-amber-700">{w}</p>)}</div>
            </div>
          )}

          {/* Mapping */}
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ border: '1px solid rgba(0,0,0,0.08)', background: 'white' }}>
            <button
              onClick={() => setMappingOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#F5F5F5] transition-colors duration-150"
            >
              <span className="text-sm font-semibold text-[#0F172A]">Mapping des colonnes</span>
              {mappingOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {mappingOpen && (
              <div className="px-5 pb-5 border-t border-[rgba(0,0,0,0.06)]">
                <div className="space-y-2 mt-4">
                  {MAIMO_FIELDS.map((field) => (
                    <div key={field} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-500 w-32 shrink-0">{FIELD_LABELS[field]}</span>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value || null }))}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs text-[#0F172A] focus:outline-none"
                        style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(0,0,0,0.12)' }}
                      >
                        <option value="">— Non mappé —</option>
                        {allColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row cards */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Aperçu des fiches ({selectedIndices.size}/{rows.length} sélectionnées)
            </p>
            <button onClick={toggleAll} className="text-xs text-[#0A0A0A] hover:underline font-medium">
              {selectedIndices.size === rows.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const selected = selectedIndices.has(idx)
              const isDuplicate = !!row._duplicate_of
              const note = editedNotes[idx] ?? row.note_generated

              return (
                <div key={idx} className="rounded-2xl transition-all duration-150" style={{
                  background: 'white',
                  border: `1px solid ${selected ? (isDuplicate ? 'rgba(245,158,11,0.3)' : 'rgba(76,110,245,0.25)') : 'rgba(0,0,0,0.08)'}`,
                  boxShadow: selected ? `0 0 0 3px ${isDuplicate ? 'rgba(245,158,11,0.08)' : 'rgba(76,110,245,0.08)'}` : '0 1px 3px rgba(0,0,0,0.05)',
                  opacity: selected ? 1 : 0.6,
                }}>
                  <div className="flex items-start gap-3 p-4">
                    <button
                      onClick={() => toggleRow(idx)}
                      className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-150"
                      style={{
                        background: selected ? 'linear-gradient(135deg, #0A0A0A, #0A0A0A)' : 'white',
                        borderColor: selected ? 'transparent' : 'rgba(30,39,97,0.2)',
                      }}
                    >
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-sm text-[#0F172A] truncate">
                          {row.company_name || <span className="text-red-400 italic">Nom manquant</span>}
                        </span>
                        {row.city && <span className="text-xs text-slate-400">· {row.city}</span>}
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={row.status === 'client' ? {
                            background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)', color: '#065F46', borderColor: 'rgba(16,185,129,0.2)',
                          } : {
                            background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', color: '#92400E', borderColor: 'rgba(245,158,11,0.2)',
                          }}>
                          {row.status === 'client' ? 'Client' : 'Prospect'}
                        </span>
                        {row.industry && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(76,110,245,0.08)', color: '#0A0A0A' }}>
                            {row.industry}
                          </span>
                        )}
                      </div>

                      {isDuplicate && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <GitMerge className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="text-xs text-amber-700">
                            Sera ajouté à <strong>{row._duplicate_of}</strong>
                          </span>
                        </div>
                      )}

                      {row.contact_name && (
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <User className="w-3 h-3" />{row.contact_name}
                          </span>
                          {row.contact_phone && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Phone className="w-3 h-3" />{row.contact_phone}
                            </span>
                          )}
                          {row.contact_email && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Mail className="w-3 h-3" />{row.contact_email}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-3 rounded-xl p-3"
                        style={{ background: 'rgba(240,244,255,0.6)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FileText className="w-3 h-3 text-[#0A0A0A]" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#0A0A0A]">Note générée</span>
                        </div>
                        <textarea
                          value={note}
                          onChange={(e) => setEditedNotes((prev) => ({ ...prev, [idx]: e.target.value }))}
                          rows={3}
                          className="w-full text-xs text-[#0F172A] leading-relaxed resize-none focus:outline-none"
                          style={{ background: 'transparent' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:left-[200px]"
        style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
        }}>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-[#0F172A]">
            {selectedIndices.size} fiche{selectedIndices.size !== 1 ? 's' : ''} sélectionnée{selectedIndices.size !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setMappingOpen(true)}>
              Mapping
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={selectedIndices.size === 0}
            >
              Importer {selectedIndices.size > 0 ? selectedIndices.size : ''} fiche{selectedIndices.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>

    </div>
  )
}

'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, FileText, Image, X, AlertCircle, Loader2, Check, Building2, Users, FileCheck, ChevronRight, ArrowRight, Search as SearchIcon, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { sanitizeFilename } from '@/lib/file-validation'
import { markOnboardingStep } from '@/lib/onboarding'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'
import type { DocumentAnalysis, ExtractedCompany } from '@/lib/document-analyzer'

const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]
const ACCEPTED_EXT = /\.(xlsx|xls|csv|pdf|docx|png|jpe?g)$/i
const MAX_SIZE_MB = 20


function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
  if (ext === 'pdf') return <FileText className="w-6 h-6 text-red-500" />
  if (ext === 'docx') return <FileText className="w-6 h-6 text-blue-500" />
  if (['png', 'jpeg', 'jpg'].includes(ext)) return <Image className="w-6 h-6 text-purple-500" />
  return <FileText className="w-6 h-6 text-slate-500" />
}

function fileCategory(name: string): 'spreadsheet' | 'document' | 'image' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet'
  if (['png', 'jpeg', 'jpg'].includes(ext)) return 'image'
  return 'document'
}

type Step = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'confirming' | 'executing' | 'error'

type AnalysisResult = {
  summary: string
  companiesCreated: string[]
  companiesUpdated: { name: string; fieldsAdded: number }[]
  contactsCreated: string[]
  notesCreated: number
  firstAccountId: string | null
  firstCompanyName: string | null
  multipleCompanies: boolean
  needsAccount: boolean
}

type AccountOption = { id: string; name: string }

type CompanyStatus = {
  name: string
  isNew: boolean
  existingId: string | null
  fieldsWouldAdd: number
  company: ExtractedCompany
}

type ActionKind = 'company_new' | 'company_update' | 'contacts' | 'index_document' | 'summary_note'

type PlannedAction = {
  id: string
  kind: ActionKind
  label: string
  sublabel?: string
  enabled: boolean
}

type PendingPreview = {
  analysis: DocumentAnalysis
  companiesStatus: CompanyStatus[]
  filePath: string
  text: string
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: enabled ? '#2563EB' : '#D1D5DB',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: enabled ? 21 : 3,
        width: 16, height: 16, borderRadius: 8, background: '#fff',
        transition: 'left 0.2s', display: 'block',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </button>
  )
}

function actionIcon(kind: ActionKind) {
  if (kind === 'company_new') return <Building2 className="w-4 h-4 text-[#2563EB]" />
  if (kind === 'company_update') return <FileCheck className="w-4 h-4 text-emerald-600" />
  if (kind === 'contacts') return <Users className="w-4 h-4 text-amber-600" />
  if (kind === 'index_document') return <SearchIcon className="w-4 h-4 text-violet-600" />
  return <Pencil className="w-4 h-4 text-slate-500" />
}

export default function ImportPage() {
  const router = useRouter()
  const { profile } = useUser()
  const { wsId } = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Post-execution results modal
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [attaching, setAttaching] = useState(false)

  // Confirmation state
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null)
  const [confirmActions, setConfirmActions] = useState<PlannedAction[]>([])
  const [executing, setExecuting] = useState(false)

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_MIME.includes(f.type) && !ACCEPTED_EXT.test(f.name)) {
      return 'Format non supporté. Utilisez .xlsx, .xls, .csv, .pdf, .docx, .png ou .jpg.'
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Fichier trop lourd (max ${MAX_SIZE_MB} MB).`
    }
    return null
  }

  const handleFile = useCallback((f: File) => {
    const err = validateFile(f)
    if (err) { setError(err); return }
    setError('')
    setSuccessMsg('')
    setFile(f)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleUpload = async () => {
    if (!file || !profile) return
    setStep('uploading')
    setError('')
    setSuccessMsg('')

    const supabase = createClient()
    const safeName = sanitizeFilename(file.name)
    const ext = safeName.split('.').pop()
    const path = `${profile.company_id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('imports').upload(path, file)
    if (uploadError) {
      setError('Erreur lors de l\'upload. ' + uploadError.message)
      setStep('error')
      return
    }

    setStep('extracting')

    const res = await fetch('/api/import/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: path, file_name: file.name, company_id: profile.company_id }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Impossible de lire le fichier. Réessayez.')
      setStep('error')
      return
    }

    const data = await res.json()

    if (data.type === 'spreadsheet') {
      setStep('idle')
      router.push(`/app/import/${data.import_id}`)
      return
    }

    // Document flow — preview planned actions
    setStep('analyzing')

    // Load accounts in parallel with analysis (for manual attach fallback)
    let accQ = supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name')
    if (wsId) accQ = accQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    const { data: accs } = await accQ
    setAccounts((accs ?? []) as AccountOption[])

    const previewRes = await fetch('/api/import/preview-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: data.text,
        file_name: file.name,
        file_type: file.name.split('.').pop()?.toLowerCase() ?? '',
        company_id: profile.company_id,
      }),
    })

    setStep('idle')

    if (!previewRes.ok) {
      const errData = await previewRes.json().catch(() => ({}))
      if (errData.code === 'RATE_LIMITED') {
        setError(errData.error)
      } else {
        setError('Erreur lors de l\'analyse du document.')
      }
      return
    }

    const preview = await previewRes.json()

    if (!preview.hasActions) {
      setSuccessMsg('Document importé avec succès.')
      setFile(null)
      return
    }

    const actions: PlannedAction[] = [
      ...preview.companiesStatus.map((cs: CompanyStatus) => ({
        id: `company-${cs.name}`,
        kind: (cs.isNew ? 'company_new' : 'company_update') as ActionKind,
        label: cs.isNew ? `Créer la fiche ${cs.name}` : `Mettre à jour ${cs.name}`,
        sublabel: !cs.isNew && cs.fieldsWouldAdd > 0
          ? `${cs.fieldsWouldAdd} information${cs.fieldsWouldAdd > 1 ? 's' : ''} à ajouter`
          : undefined,
        enabled: cs.isNew || cs.fieldsWouldAdd > 0,
      })),
      ...(preview.analysis.contacts.length > 0 ? [{
        id: 'contacts',
        kind: 'contacts' as ActionKind,
        label: `Ajouter ${preview.analysis.contacts.length} interlocuteur${preview.analysis.contacts.length > 1 ? 's' : ''}`,
        sublabel: preview.analysis.contacts
          .slice(0, 3)
          .map((c: { firstName: string }) => c.firstName)
          .join(', ') + (preview.analysis.contacts.length > 3 ? '…' : ''),
        enabled: true,
      }] : []),
      ...(preview.companiesStatus.length > 0 ? [{
        id: 'index_document',
        kind: 'index_document' as ActionKind,
        label: 'Indexer le document dans la recherche IA',
        enabled: true,
      }] : []),
      ...(preview.analysis.notes.length > 0 ? [{
        id: 'summary_note',
        kind: 'summary_note' as ActionKind,
        label: 'Créer une note résumé',
        sublabel: preview.analysis.notes.length > 1
          ? `${preview.analysis.notes.length} notes détectées`
          : (preview.analysis.notes[0]?.title as string | undefined),
        enabled: false,
      }] : []),
    ]

    setPendingPreview({ analysis: preview.analysis, companiesStatus: preview.companiesStatus, filePath: path, text: data.text })
    setConfirmActions(actions)
    setStep('confirming')
  }

  const handleIgnoreAll = () => {
    setPendingPreview(null)
    setConfirmActions([])
    setStep('idle')
    setFile(null)
    setSuccessMsg('Document importé sans actions IA.')
  }

  const handleExecute = async () => {
    if (!pendingPreview || !profile) return
    setExecuting(true)

    const selectedCompanyNames = confirmActions
      .filter((a) => (a.kind === 'company_new' || a.kind === 'company_update') && a.enabled)
      .map((a) => a.id.replace(/^company-/, ''))

    const includeContacts = confirmActions.find((a) => a.kind === 'contacts')?.enabled ?? false
    const indexDocument = confirmActions.find((a) => a.kind === 'index_document')?.enabled ?? false
    const createNotes = confirmActions.find((a) => a.kind === 'summary_note')?.enabled ?? false

    const res = await fetch('/api/import/execute-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: pendingPreview.text,
        file_path: pendingPreview.filePath,
        file_name: file?.name ?? '',
        file_type: file?.name.split('.').pop()?.toLowerCase() ?? '',
        company_id: profile.company_id,
        workspace_id: wsId ?? null,
        analysis: pendingPreview.analysis,
        selectedCompanyNames,
        includeContacts,
        indexDocument,
        createNotes,
      }),
    })

    setExecuting(false)
    setPendingPreview(null)
    setConfirmActions([])
    setStep('idle')
    setFile(null)

    if (!res.ok) {
      setError("Erreur lors de l'exécution des actions.")
      return
    }

    const result = await res.json()
    setAnalysisResult(result)
    if ((result.companiesCreated?.length ?? 0) > 0 || (result.companiesUpdated?.length ?? 0) > 0) {
      markOnboardingStep(1)
    }
  }

  // Fallback: manually attach when no companies were detected
  const handleManualAttach = async () => {
    if (!pendingPreview || !profile || !selectedAccountId) return
    setAttaching(true)
    const ext = (pendingPreview.filePath.split('.').pop() ?? '').toLowerCase()
    const fileName = file?.name ?? pendingPreview.filePath.split('/').pop() ?? 'document'
    const res = await fetch('/api/import/attach-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: pendingPreview.text,
        file_path: pendingPreview.filePath,
        file_name: fileName,
        file_type: ext,
        account_id: selectedAccountId,
        company_id: profile.company_id,
        workspace_id: wsId ?? null,
      }),
    })
    setAttaching(false)
    if (res.ok) {
      router.push(`/app/accounts/${selectedAccountId}`)
    } else {
      setError('Erreur lors de l\'association du document.')
    }
  }

  const handleCloseResults = () => {
    setAnalysisResult(null)
    setSelectedAccountId('')
  }

  const toggleAction = (id: string) => {
    setConfirmActions((prev) =>
      prev.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a)
    )
  }

  const busy = step === 'uploading' || step === 'extracting' || step === 'analyzing'

  const stepLabel =
    step === 'uploading' ? 'Envoi du fichier…' :
    step === 'extracting' ? 'Extraction du contenu…' :
    'Analyse IA en cours…'

  const anyEnabled = confirmActions.some((a) => a.enabled)

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Import" />
      <div className="flex-1 p-4 md:p-8 max-w-2xl mx-auto w-full">

        <Breadcrumb items={[
          { label: 'MAIMOO', href: '/app/dashboard' },
          { label: 'Importer' },
        ]} />

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Importer un fichier</h1>
          <p className="text-slate-500 text-sm mt-1">
            Liste clients (Excel/CSV) ou document à indexer (PDF, Word, image)
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !file && inputRef.current?.click()}
          className="relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer mb-6"
          style={{
            borderColor: isDragging ? '#0A0A0A' : file ? 'rgba(16,185,129,0.4)' : 'rgba(30,39,97,0.2)',
            background: isDragging ? 'rgba(76,110,245,0.04)' : file ? 'rgba(16,185,129,0.03)' : 'rgba(240,244,255,0.5)',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.docx,.png,.jpeg,.jpg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {!file ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(0,0,0,0.06)' }}>
                <Upload className="w-8 h-8 text-[#0A0A0A]" />
              </div>
              <p className="font-semibold text-[#0F172A] mb-1">Glissez votre fichier ici</p>
              <p className="text-sm text-slate-400 mb-3">ou cliquez pour parcourir</p>
              <p className="text-xs text-slate-300">.xlsx · .xls · .csv · .pdf · .docx · .png · .jpg · max {MAX_SIZE_MB} MB</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 px-6 py-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)' }}>
                {fileIcon(file.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#0F172A] truncate">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(0)} KB · {
                    fileCategory(file.name) === 'spreadsheet' ? 'Liste clients' :
                    fileCategory(file.name) === 'image' ? 'Image (extraction texte via IA)' :
                    'Document (analyse IA + indexation)'
                  }
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setError('') }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2.5 mb-6 rounded-xl px-4 py-3"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6"
            style={{ background: 'rgba(76,110,245,0.06)', border: '1px solid rgba(76,110,245,0.12)' }}>
            <Loader2 className="w-4 h-4 text-[#0A0A0A] animate-spin shrink-0" />
            <p className="text-sm text-[#0A0A0A] font-medium">{stepLabel}</p>
          </div>
        )}

        <Button onClick={handleUpload} disabled={!file || busy || step === 'confirming'} loading={busy} size="lg" className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          Importer le fichier
        </Button>

      </div>

      {/* ── Confirmation modal ─────────────────────────────────────────────────── */}
      {step === 'confirming' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: 'rgba(10,16,35,0.65)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '80vh' }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 shrink-0">
              <p className="font-bold text-[#0F172A] text-lg">Actions détectées</p>
              {pendingPreview?.analysis.summary && (
                <p className="text-sm text-slate-500 mt-1 leading-relaxed line-clamp-2">
                  {pendingPreview.analysis.summary}
                </p>
              )}
            </div>

            {/* Action list */}
            <div className="overflow-y-auto flex-1 px-6 pb-2">
              <div className="space-y-2">
                {confirmActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(0,0,0,0.04)' }}>
                      {actionIcon(action.kind)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0F172A] leading-snug">{action.label}</p>
                      {action.sublabel && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{action.sublabel}</p>
                      )}
                    </div>
                    <Toggle enabled={action.enabled} onChange={() => toggleAction(action.id)} />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-4 shrink-0 border-t border-slate-100">
              <div className="flex gap-3">
                <button
                  onClick={handleIgnoreAll}
                  disabled={executing}
                  className="flex-1 py-3 text-sm font-medium text-slate-500 rounded-xl transition-colors hover:bg-slate-50"
                  style={{ border: '1px solid #E5E7EB' }}
                >
                  Ignorer tout
                </button>
                <Button
                  className="flex-1"
                  onClick={handleExecute}
                  loading={executing}
                  disabled={!anyEnabled}
                >
                  {anyEnabled ? 'Appliquer les actions' : 'Aucune action'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Analysis result modal ──────────────────────────────────────────── */}
      {analysisResult && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: 'rgba(10,16,35,0.65)', backdropFilter: 'blur(6px)' }}
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="px-7 pt-7 pb-5"
              style={{ background: 'linear-gradient(135deg, #0A0A0A 0%, #0A0A0A 100%)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-white text-lg">Import terminé</span>
              </div>
              {analysisResult.summary && (
                <p className="text-white/80 text-sm leading-relaxed">{analysisResult.summary}</p>
              )}
            </div>

            <div className="px-7 py-5 space-y-3">

              {analysisResult.companiesCreated.length > 0 && (
                <div className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: 'rgba(76,110,245,0.06)', border: '1px solid rgba(76,110,245,0.12)' }}>
                  <Building2 className="w-4 h-4 text-[#0A0A0A] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {analysisResult.companiesCreated.length} fiche{analysisResult.companiesCreated.length > 1 ? 's' : ''} entreprise créée{analysisResult.companiesCreated.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{analysisResult.companiesCreated.join(', ')}</p>
                  </div>
                </div>
              )}

              {analysisResult.companiesUpdated.length > 0 && (
                <div className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <FileCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {analysisResult.companiesUpdated.length} fiche{analysisResult.companiesUpdated.length > 1 ? 's' : ''} mise{analysisResult.companiesUpdated.length > 1 ? 's' : ''} à jour
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {analysisResult.companiesUpdated.map((u) => `${u.name} (+${u.fieldsAdded} info${u.fieldsAdded > 1 ? 's' : ''})`).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {analysisResult.contactsCreated.length > 0 && (
                <div className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <Users className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {analysisResult.contactsCreated.length} contact{analysisResult.contactsCreated.length > 1 ? 's' : ''} ajouté{analysisResult.contactsCreated.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{analysisResult.contactsCreated.join(', ')}</p>
                  </div>
                </div>
              )}

              {analysisResult.notesCreated > 0 && (
                <div className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <FileText className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold text-[#0F172A]">
                    {analysisResult.notesCreated} note{analysisResult.notesCreated > 1 ? 's' : ''} créée{analysisResult.notesCreated > 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {/* Nothing created + needs manual account */}
              {analysisResult.needsAccount && (
                <div className="rounded-xl p-4"
                  style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(30,39,97,0.1)' }}>
                  <p className="text-sm text-[#64748B] mb-3">
                    Aucune entreprise détectée. Associez manuellement ce document :
                  </p>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[#0F172A] focus:outline-none"
                      style={{ background: 'white', border: '1px solid rgba(30,39,97,0.15)' }}
                    >
                      <option value="">Sélectionner une entreprise…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

            </div>

            {/* Actions */}
            <div className="px-7 pb-7 space-y-2">
              {analysisResult.needsAccount ? (
                <Button
                  className="w-full"
                  onClick={handleManualAttach}
                  disabled={!selectedAccountId}
                  loading={attaching}
                >
                  Associer le document
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : analysisResult.firstAccountId && !analysisResult.multipleCompanies ? (
                <Button
                  className="w-full"
                  onClick={() => router.push(`/app/accounts/${analysisResult.firstAccountId}`)}
                >
                  Voir la fiche {analysisResult.firstCompanyName}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => router.push('/app/portfolio')}
                >
                  Voir le portefeuille
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}

              <button
                onClick={handleCloseResults}
                className="w-full text-sm text-[#94A3B8] hover:text-[#64748B] py-2 transition-colors"
              >
                Fermer
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

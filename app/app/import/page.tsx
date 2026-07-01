'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, FileText, Image, X, AlertCircle, Loader2, Check, Building2, Users, FileCheck, ChevronRight, ArrowRight, Search as SearchIcon, Pencil, Mail, Phone, ChevronDown } from 'lucide-react'
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
  // kept from pendingPreview for handleManualAttach (pendingPreview is cleared before user clicks Associer)
  _filePath?: string
  _text?: string
  _fileName?: string
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
  const [showImportDetail, setShowImportDetail] = useState(false)

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

    // Capture before pendingPreview is cleared — needed for handleManualAttach if needsAccount is true
    const savedFilePath = pendingPreview.filePath
    const savedText = pendingPreview.text
    const savedFileName = file?.name ?? pendingPreview.filePath.split('/').pop() ?? 'document'

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
    setAnalysisResult({ ...result, _filePath: savedFilePath, _text: savedText, _fileName: savedFileName })
    if ((result.companiesCreated?.length ?? 0) > 0 || (result.companiesUpdated?.length ?? 0) > 0) {
      markOnboardingStep(1)
    }
  }

  // Fallback: manually attach when no companies were detected
  const handleManualAttach = async () => {
    if (!analysisResult || !profile || !selectedAccountId) return
    const filePath = analysisResult._filePath
    const text = analysisResult._text
    const fileName = analysisResult._fileName
    if (!filePath || !text || !fileName) {
      setError('Données du document manquantes. Veuillez réimporter le fichier.')
      return
    }
    setAttaching(true)
    const ext = (filePath.split('.').pop() ?? '').toLowerCase()
    const res = await fetch('/api/import/attach-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        file_path: filePath,
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
      setError("Erreur lors de l'association du document.")
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

            {/* Voir le détail toggle */}
            {pendingPreview && (pendingPreview.analysis.contacts.length > 0 || pendingPreview.analysis.notes.length > 0 || pendingPreview.companiesStatus.length > 0) && (
              <div className="px-6 pb-2 shrink-0">
                <button
                  onClick={() => setShowImportDetail(v => !v)}
                  className="flex items-center gap-1.5 text-[#2563EB] text-sm font-medium py-1"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
                >
                  <ChevronDown size={14} style={{ transform: showImportDetail ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                  {showImportDetail ? 'Masquer le détail' : 'Voir le détail des actions'}
                </button>

                {showImportDetail && (
                  <div className="rounded-xl overflow-hidden mb-3" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                    {/* Companies */}
                    {pendingPreview.companiesStatus.length > 0 && (
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E7EB' }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px 0' }}>Entreprises détectées</p>
                        {pendingPreview.companiesStatus.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#ffffff', borderRadius: 10, border: '1px solid #F3F4F6', marginBottom: 6 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: c.isNew ? '#EFF6FF' : '#F0FDF4', color: c.isNew ? '#2563EB' : '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {c.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{c.name}</span>
                              {c.company.city && <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>{c.company.city}</span>}
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: c.isNew ? '#EFF6FF' : '#F0FDF4', color: c.isNew ? '#2563EB' : '#16A34A' }}>
                              {c.isNew ? 'Nouveau' : `+${c.fieldsWouldAdd} info${c.fieldsWouldAdd > 1 ? 's' : ''}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Contacts */}
                    {pendingPreview.analysis.contacts.length > 0 && (
                      <div style={{ padding: '14px 16px', borderBottom: pendingPreview.analysis.notes.length > 0 ? '1px solid #E5E7EB' : undefined }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px 0' }}>Interlocuteurs détectés</p>
                        {pendingPreview.analysis.contacts.map((c, i) => {
                          const initials = `${c.firstName?.[0] ?? ''}${c.lastName?.[0] ?? ''}`.toUpperCase()
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#ffffff', borderRadius: 10, border: '1px solid #F3F4F6', marginBottom: 6 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{c.firstName} {c.lastName}</div>
                                {c.position && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{c.position}</div>}
                                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                  {c.email && (
                                    <a href={`mailto:${c.email}`} style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <Mail size={11} />{c.email}
                                    </a>
                                  )}
                                  {c.phone && (
                                    <span style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <Phone size={11} />{c.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Notes */}
                    {pendingPreview.analysis.notes.map((n, i) => (
                      <div key={i} style={{ padding: '14px 16px', borderBottom: i < pendingPreview.analysis.notes.length - 1 ? '1px solid #E5E7EB' : undefined }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px 0' }}>Note suggérée</p>
                        <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #F3F4F6', padding: '12px 14px' }}>
                          {n.title && <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 4px 0' }}>{n.title}</p>}
                          <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>"{n.content.slice(0, 200)}{n.content.length > 200 ? '…' : ''}"</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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

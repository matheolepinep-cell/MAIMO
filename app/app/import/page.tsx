'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, FileText, Image, X, AlertCircle, Loader2, Check, Building2, Users, FileCheck, ChevronRight, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'

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

const DETECTABLE_COLUMNS = [
  'Nom entreprise', 'Ville', 'Secteur d\'activité', 'Contact', 'Téléphone',
  'Email', 'Statut (client/prospect)', 'Notes', 'Remise', 'CA estimé',
]

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

type Step = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'error'

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

export default function ImportPage() {
  const router = useRouter()
  const { profile } = useUser()
  const { wsId } = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')

  // Document analysis modal state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [attaching, setAttaching] = useState(false)

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

    const supabase = createClient()
    const ext = file.name.split('.').pop()
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

    // Document flow — run full analysis
    setStep('analyzing')
    setPendingFilePath(path)
    setPendingText(data.text)

    // Load accounts in parallel with analysis
    let accQ = supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name')
    if (wsId) accQ = accQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    const { data: accs } = await accQ
    setAccounts((accs ?? []) as AccountOption[])

    const analyzeRes = await fetch('/api/import/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: data.text,
        file_path: path,
        file_name: file.name,
        file_type: file.name.split('.').pop()?.toLowerCase() ?? '',
        company_id: profile.company_id,
        workspace_id: wsId ?? null,
      }),
    })

    setStep('idle')

    if (!analyzeRes.ok) {
      setError('Erreur lors de l\'analyse du document.')
      return
    }

    const result = await analyzeRes.json()
    setAnalysisResult(result)
  }

  // Fallback: manually attach when no companies were detected
  const handleManualAttach = async () => {
    if (!pendingText || !pendingFilePath || !profile || !selectedAccountId) return
    setAttaching(true)
    const ext = (pendingFilePath.split('.').pop() ?? '').toLowerCase()
    const fileName = file?.name ?? pendingFilePath.split('/').pop() ?? 'document'
    const res = await fetch('/api/import/attach-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: pendingText,
        file_path: pendingFilePath,
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

  const handleClose = () => {
    setAnalysisResult(null)
    setPendingFilePath(null)
    setPendingText(null)
    setSelectedAccountId('')
    setFile(null)
  }

  const busy = step === 'uploading' || step === 'extracting' || step === 'analyzing'

  const stepLabel =
    step === 'uploading' ? 'Envoi du fichier…' :
    step === 'extracting' ? 'Extraction du contenu…' :
    'Analyse IA en cours…'

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

        {busy && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6"
            style={{ background: 'rgba(76,110,245,0.06)', border: '1px solid rgba(76,110,245,0.12)' }}>
            <Loader2 className="w-4 h-4 text-[#0A0A0A] animate-spin shrink-0" />
            <p className="text-sm text-[#0A0A0A] font-medium">{stepLabel}</p>
          </div>
        )}

        <Button onClick={handleUpload} disabled={!file || busy} loading={busy} size="lg" className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          Importer le fichier
        </Button>

        {/* Columns hint (spreadsheet only) */}
        {(!file || fileCategory(file.name) === 'spreadsheet') && (
          <div className="mt-8 rounded-2xl p-5"
            style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
              Colonnes reconnues automatiquement (Excel/CSV)
            </p>
            <div className="flex flex-wrap gap-2">
              {DETECTABLE_COLUMNS.map((col) => (
                <span key={col} className="px-2.5 py-1 rounded-xl text-xs font-medium text-[#0A0A0A]"
                  style={{ background: 'rgba(76,110,245,0.08)' }}>
                  {col}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              L&apos;IA s&apos;adapte à votre format — pas besoin de modèle spécifique
            </p>
          </div>
        )}
      </div>

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

              {/* What was created */}
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
                      {analysisResult.companiesUpdated.length} fiche{analysisResult.companiesUpdated.length > 1 ? 's' : ''} déjà existante{analysisResult.companiesUpdated.length > 1 ? 's' : ''} — mise à jour
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
                    Aucune entreprise détectée automatiquement. Associez manuellement ce document :
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
                onClick={handleClose}
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

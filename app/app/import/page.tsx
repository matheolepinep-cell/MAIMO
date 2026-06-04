'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, FileText, Image, X, AlertCircle, Loader2, Check, Building2, ChevronDown } from 'lucide-react'
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

type Step = 'idle' | 'uploading' | 'extracting' | 'error'

type DocPending = {
  text: string
  file_path: string
  file_name: string
}

type DetectionResult = {
  matched: boolean
  company_name: string
  account_id: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
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

  // Document detection modal state
  const [docPending, setDocPending] = useState<DocPending | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [showAltPicker, setShowAltPicker] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [attachSuccess, setAttachSuccess] = useState(false)

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
    setStep('idle')

    if (data.type === 'spreadsheet') {
      router.push(`/app/import/${data.import_id}`)
      return
    }

    // Document — start detection flow
    const pending: DocPending = { text: data.text, file_path: path, file_name: file.name }
    setDocPending(pending)
    setDetecting(true)

    // Load accounts in parallel with detection
    let accQ = supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).order('name')
    if (wsId) accQ = accQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    const { data: accs } = await accQ
    setAccounts((accs ?? []) as AccountOption[])

    // Detect company
    const detectRes = await fetch('/api/import/detect-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: pending.text, company_id: profile.company_id }),
    })
    if (detectRes.ok) {
      const det = await detectRes.json()
      setDetection(det)
      if (det.account_id) setSelectedAccountId(det.account_id)
    } else {
      setDetection({ matched: false, company_name: '', account_id: null, confidence: 'low', reason: '' })
    }
    setDetecting(false)
  }

  const handleAttach = async (accountId: string) => {
    if (!docPending || !profile || !accountId) return
    setAttaching(true)
    const ext = docPending.file_name.split('.').pop()?.toLowerCase() ?? ''
    const res = await fetch('/api/import/attach-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: docPending.text,
        file_path: docPending.file_path,
        file_name: docPending.file_name,
        file_type: ext,
        account_id: accountId,
        company_id: profile.company_id,
        workspace_id: wsId ?? null,
      }),
    })
    setAttaching(false)
    if (res.ok) {
      const { account_id } = await res.json()
      setAttachSuccess(true)
      setTimeout(() => router.push(`/app/accounts/${account_id}`), 1500)
    } else {
      setError('Erreur lors de l\'association du document.')
    }
  }

  const handleIgnore = () => {
    setDocPending(null)
    setDetection(null)
    setSelectedAccountId('')
    setAttachSuccess(false)
    setFile(null)
  }

  const busy = step === 'uploading' || step === 'extracting'

  const showModal = !!docPending

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
            borderColor: isDragging ? '#4C6EF5' : file ? 'rgba(16,185,129,0.4)' : 'rgba(30,39,97,0.2)',
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
                style={{ background: 'rgba(76,110,245,0.1)' }}>
                <Upload className="w-8 h-8 text-[#4C6EF5]" />
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
                    'Document (indexé pour la recherche)'
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
            <Loader2 className="w-4 h-4 text-[#4C6EF5] animate-spin shrink-0" />
            <p className="text-sm text-[#1E2761] font-medium">
              {step === 'uploading' ? 'Envoi du fichier…' : 'Extraction du contenu…'}
            </p>
          </div>
        )}

        <Button onClick={handleUpload} disabled={!file || busy} loading={busy} size="lg" className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          Importer le fichier
        </Button>

        {/* Columns hint (spreadsheet only) */}
        {(!file || fileCategory(file.name) === 'spreadsheet') && (
          <div className="mt-8 rounded-2xl p-5"
            style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(30,39,97,0.08)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
              Colonnes reconnues automatiquement (Excel/CSV)
            </p>
            <div className="flex flex-wrap gap-2">
              {DETECTABLE_COLUMNS.map((col) => (
                <span key={col} className="px-2.5 py-1 rounded-xl text-xs font-medium text-[#1E2761]"
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

      {/* Company detection modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: 'rgba(10,16,35,0.65)', backdropFilter: 'blur(6px)' }}
        >
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-7">

            {attachSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-green-600" />
                </div>
                <p className="font-bold text-[#0F172A] mb-1">Document associé !</p>
                <p className="text-sm text-[#64748B]">Redirection vers la fiche client…</p>
              </div>
            ) : detecting ? (
              <div className="text-center py-6">
                <Loader2 className="w-8 h-8 text-[#4C6EF5] animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium text-[#0F172A]">Analyse du document…</p>
                <p className="text-xs text-slate-400 mt-1">Détection automatique de l&apos;entreprise</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
                    style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}>
                    M
                  </div>
                  <span className="font-bold text-[#1E2761]">Association au client</span>
                </div>

                <p className="text-xs text-slate-400 truncate mb-4">{docPending?.file_name}</p>

                {detection?.matched && (detection.confidence === 'high' || detection.confidence === 'medium') && !showAltPicker ? (
                  <>
                    <div className="rounded-xl p-4 mb-4"
                      style={{ background: 'rgba(76,110,245,0.06)', border: '1px solid rgba(76,110,245,0.12)' }}>
                      <p className="text-xs text-slate-500 mb-1">Document détecté pour</p>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#4C6EF5]" />
                        <p className="font-semibold text-[#0F172A]">{detection.company_name}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: detection.confidence === 'high' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: detection.confidence === 'high' ? '#065F46' : '#92400E' }}>
                          {detection.confidence === 'high' ? 'Certain' : 'Probable'}
                        </span>
                      </div>
                      {detection.reason && (
                        <p className="text-xs text-slate-400 mt-2 italic">{detection.reason}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Button className="w-full" onClick={() => handleAttach(detection.account_id!)} loading={attaching}>
                        Confirmer — {detection.company_name}
                      </Button>
                      <Button variant="secondary" className="w-full" onClick={() => setShowAltPicker(true)}>
                        <ChevronDown className="w-4 h-4 mr-1" />
                        Choisir une autre entreprise
                      </Button>
                      <button onClick={handleIgnore}
                        className="w-full text-sm text-[#94A3B8] hover:text-[#64748B] py-2 transition-colors">
                        Ignorer
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#64748B] mb-4">
                      {detection?.matched === false || detection?.confidence === 'low'
                        ? 'Aucune correspondance certaine détectée. Sélectionnez l\'entreprise manuellement :'
                        : 'Choisissez l\'entreprise à associer :'}
                    </p>

                    <div className="relative mb-4">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[#0F172A] focus:outline-none"
                        style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(30,39,97,0.12)' }}
                      >
                        <option value="">Sélectionner une entreprise…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Button className="w-full" onClick={() => handleAttach(selectedAccountId)}
                        disabled={!selectedAccountId} loading={attaching}>
                        Associer le document
                      </Button>
                      {showAltPicker && (
                        <Button variant="secondary" className="w-full" onClick={() => setShowAltPicker(false)}>
                          ← Retour
                        </Button>
                      )}
                      <button onClick={handleIgnore}
                        className="w-full text-sm text-[#94A3B8] hover:text-[#64748B] py-2 transition-colors">
                        Ignorer
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

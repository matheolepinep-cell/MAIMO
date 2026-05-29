'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, X, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/pdf',
]
const MAX_SIZE_MB = 10

const DETECTABLE_COLUMNS = [
  'Nom entreprise', 'Ville', 'Secteur d\'activité', 'Contact', 'Téléphone',
  'Email', 'Statut (client/prospect)', 'Notes', 'Remise', 'CA estimé',
]

type Step = 'idle' | 'uploading' | 'parsing' | 'error'

export default function ImportPage() {
  const router = useRouter()
  const { profile } = useUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(xlsx|xls|csv|pdf)$/i)) {
      return 'Format non supporté. Utilisez .xlsx, .xls, .csv ou .pdf.'
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

    // 1. Upload to Storage
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${profile.company_id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('imports').upload(path, file)
    if (uploadError) {
      setError('Erreur lors de l\'upload. ' + uploadError.message)
      setStep('error')
      return
    }

    // 2. Parse file (fast — no Claude call)
    setStep('parsing')

    const res = await fetch('/api/import/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: path,
        file_name: file.name,
        company_id: profile.company_id,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Impossible de lire le fichier. Réessayez.')
      setStep('error')
      return
    }

    const { import_id } = await res.json()
    // Redirect immediately — analysis by batch happens on the next page
    router.push(`/app/import/${import_id}`)
  }

  const busy = step === 'uploading' || step === 'parsing'

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Import de liste clients" />
      <div className="flex-1 p-4 md:p-8 max-w-2xl mx-auto w-full">

        <Breadcrumb items={[
          { label: 'MAIMO', href: '/app/dashboard' },
          { label: 'Importer une liste clients' },
        ]} />

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Importer une liste clients</h1>
          <p className="text-slate-500 text-sm mt-1">
            Votre fichier sera analysé par IA — vous validez avant tout import
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
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {!file ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(76,110,245,0.1)' }}>
                <FileSpreadsheet className="w-8 h-8 text-[#4C6EF5]" />
              </div>
              <p className="font-semibold text-[#0F172A] mb-1">Glissez votre fichier ici</p>
              <p className="text-sm text-slate-400 mb-3">ou cliquez pour parcourir</p>
              <p className="text-xs text-slate-300">.xlsx · .xls · .csv · .pdf · max {MAX_SIZE_MB} MB</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 px-6 py-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)' }}>
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#0F172A] truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
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
              {step === 'uploading' ? 'Envoi du fichier…' : 'Lecture du fichier…'}
            </p>
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={!file || busy}
          loading={busy}
          size="lg"
          className="w-full"
        >
          <Upload className="w-4 h-4 mr-2" />
          Importer le fichier
        </Button>

        {/* Columns hint */}
        <div className="mt-8 rounded-2xl p-5"
          style={{ background: 'rgba(240,244,255,0.8)', border: '1px solid rgba(30,39,97,0.08)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Colonnes reconnues automatiquement
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
            L'IA s'adapte à votre format — pas besoin de modèle spécifique
          </p>
        </div>

      </div>
    </div>
  )
}

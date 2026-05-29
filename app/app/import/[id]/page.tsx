'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronUp, AlertTriangle, Check, Loader2,
  Building2, Phone, Mail, FileText, User
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'

type MaimoField = 'company_name' | 'city' | 'industry' | 'status' | 'contact_name' | 'contact_phone' | 'contact_email' | 'revenue' | 'notes'
type Mapping = Record<MaimoField, string | null>
type PreviewRow = Record<MaimoField, string> & { note_generated: string; _raw: Record<string, unknown> }

const FIELD_LABELS: Record<MaimoField, string> = {
  company_name: 'Nom entreprise',
  city: 'Ville',
  industry: 'Secteur',
  status: 'Statut',
  contact_name: 'Contact',
  contact_phone: 'Téléphone',
  contact_email: 'Email',
  revenue: 'CA estimé',
  notes: 'Notes',
}
const MAIMO_FIELDS = Object.keys(FIELD_LABELS) as MaimoField[]

type PreviewPayload = {
  mapping: Mapping
  rows: PreviewRow[]
  total_rows: number
  warnings: string[]
}

type ImportData = {
  id: string
  file_name: string
  preview: PreviewPayload
}

export default function ImportValidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile } = useUser()

  const [importData, setImportData] = useState<ImportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mapping, setMapping] = useState<Mapping>({} as Mapping)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [editedNotes, setEditedNotes] = useState<Record<number, string>>({})
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [mappingOpen, setMappingOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('bulk_imports')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) { setError('Import introuvable.'); setLoading(false); return }
        const payload = data.preview as PreviewPayload
        setImportData(data as ImportData)
        setMapping(payload.mapping ?? ({} as Mapping))
        setPreview(payload.rows ?? [])
        // Select all by default
        setSelectedIndices(new Set((payload.rows ?? []).map((_, i) => i)))
        setLoading(false)
      })
  }, [id])

  const allColumns = preview[0]?._raw ? Object.keys(preview[0]._raw) : []

  const toggleRow = useCallback((idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const toggleAll = () => {
    if (selectedIndices.size === preview.length) setSelectedIndices(new Set())
    else setSelectedIndices(new Set(preview.map((_, i) => i)))
  }

  const handleImport = async () => {
    if (!profile || selectedIndices.size === 0) return
    setImporting(true)
    setImportError('')

    // Apply edited notes back into preview before sending
    const finalPreview = preview.map((row, i) => ({
      ...row,
      note_generated: editedNotes[i] ?? row.note_generated,
    }))

    // Update preview in DB with edited notes (so execute API has the right content)
    const supabase = createClient()
    await supabase.from('bulk_imports').update({
      preview: {
        ...(importData?.preview ?? {}),
        rows: finalPreview,
      },
    }).eq('id', id)

    const res = await fetch('/api/import/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        import_id: id,
        selected_indices: Array.from(selectedIndices),
        company_id: profile.company_id,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setImportError(data.error ?? 'Erreur lors de l\'import.')
      setImporting(false)
      return
    }

    const result = await res.json()
    router.push(`/app/import/${id}/done?created=${result.created}&merged=${result.merged ?? 0}&skipped=${result.skipped}&contacts=${result.contacts_created}&notes=${result.notes_created}`)
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Validation" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#4C6EF5] animate-spin" />
            <p className="text-slate-500 text-sm">Chargement…</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !importData) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Import" />
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-[#0F172A] font-medium">{error || 'Données introuvables.'}</p>
            <button onClick={() => router.push('/app/import')} className="mt-4 text-sm text-[#4C6EF5] hover:underline">
              Recommencer →
            </button>
          </div>
        </div>
      </div>
    )
  }

  const contactCount = preview.filter((r) => r.contact_name?.trim()).length

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Validation de l'import" />

      <div className="flex-1 pb-32">
        <div className="p-4 md:p-8 max-w-3xl mx-auto">

          <Breadcrumb items={[
            { label: 'MAIMO', href: '/app/dashboard' },
            { label: 'Importer', href: '/app/import' },
            { label: 'Validation' },
          ]} />

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
              Validation de l'import
            </h1>
            <p className="text-slate-500 text-sm mt-1 truncate">{importData.file_name}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full text-[#1E2761]"
                style={{ background: 'rgba(76,110,245,0.1)' }}>
                {preview.length} entreprise{preview.length !== 1 ? 's' : ''} détectée{preview.length !== 1 ? 's' : ''}
              </span>
              {contactCount > 0 && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full text-emerald-700"
                  style={{ background: 'rgba(16,185,129,0.1)' }}>
                  {contactCount} contact{contactCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Warnings */}
          {(importData.preview.warnings ?? []).length > 0 && (
            <div className="rounded-xl p-4 mb-5 flex items-start gap-3"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                {(importData.preview.warnings ?? []).map((w, i) => (
                  <p key={i} className="text-sm text-amber-700">{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Mapping section (collapsible) */}
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ border: '1px solid rgba(30,39,97,0.08)', background: 'white' }}>
            <button
              onClick={() => setMappingOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#F0F4FF] transition-colors duration-150"
            >
              <span className="text-sm font-semibold text-[#0F172A]">Mapping des colonnes</span>
              {mappingOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {mappingOpen && (
              <div className="px-5 pb-5 border-t border-[rgba(30,39,97,0.06)]">
                <div className="space-y-2 mt-4">
                  {MAIMO_FIELDS.map((field) => (
                    <div key={field} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-500 w-32 shrink-0">{FIELD_LABELS[field]}</span>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value || null }))}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs text-[#0F172A] focus:outline-none transition-all duration-150"
                        style={{
                          background: 'rgba(240,244,255,0.8)',
                          border: '1px solid rgba(30,39,97,0.12)',
                        }}
                      >
                        <option value="">— Non mappé —</option>
                        {allColumns.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview cards */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Aperçu des fiches ({selectedIndices.size}/{preview.length} sélectionnées)
            </p>
            <button onClick={toggleAll} className="text-xs text-[#4C6EF5] hover:underline font-medium">
              {selectedIndices.size === preview.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          <div className="space-y-3">
            {preview.map((row, idx) => {
              const selected = selectedIndices.has(idx)
              const note = editedNotes[idx] ?? row.note_generated
              return (
                <div
                  key={idx}
                  className="rounded-2xl transition-all duration-150"
                  style={{
                    background: 'white',
                    border: `1px solid ${selected ? 'rgba(76,110,245,0.25)' : 'rgba(30,39,97,0.08)'}`,
                    boxShadow: selected ? '0 0 0 3px rgba(76,110,245,0.08)' : '0 1px 3px rgba(30,39,97,0.05)',
                    opacity: selected ? 1 : 0.6,
                  }}
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3 p-4">
                    <button
                      onClick={() => toggleRow(idx)}
                      className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-150"
                      style={{
                        background: selected ? 'linear-gradient(135deg, #1E2761, #3B5BDB)' : 'white',
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
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={row.status === 'client' ? {
                            background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                            color: '#065F46',
                            borderColor: 'rgba(16,185,129,0.2)',
                          } : {
                            background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                            color: '#92400E',
                            borderColor: 'rgba(245,158,11,0.2)',
                          }}
                        >
                          {row.status === 'client' ? 'Client' : 'Prospect'}
                        </span>
                        {row.industry && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(76,110,245,0.08)', color: '#1E2761' }}>
                            {row.industry}
                          </span>
                        )}
                      </div>

                      {/* Contact */}
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

                      {/* Note */}
                      <div className="mt-3 rounded-xl p-3"
                        style={{ background: 'rgba(240,244,255,0.6)', border: '1px solid rgba(30,39,97,0.06)' }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FileText className="w-3 h-3 text-[#4C6EF5]" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4C6EF5]">Note générée</span>
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
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:left-[200px]"
        style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(30,39,97,0.08)',
          boxShadow: '0 -4px 24px rgba(30,39,97,0.08)',
        }}
      >
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">
              {selectedIndices.size} entreprise{selectedIndices.size !== 1 ? 's' : ''} sélectionnée{selectedIndices.size !== 1 ? 's' : ''}
            </p>
            {importError && <p className="text-xs text-red-500">{importError}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setMappingOpen(true)}>
              Modifier le mapping
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={selectedIndices.size === 0 || importing}
              loading={importing}
            >
              Importer {selectedIndices.size > 0 ? selectedIndices.size : ''} entreprise{selectedIndices.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>

    </div>
  )
}

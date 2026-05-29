'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Edit2, Save, X, Plus, Trash2, Mic, MicOff, Send, Type,
  FileText, Upload, Search, ExternalLink, User, Star, Volume2, Globe, Lock, Users
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Modal } from '@/components/ui/Modal'
import type { Account, Contact, Note, Document, SearchSource } from '@/types/database'

/* ─── helpers ─── */
function fmt(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
}
function fmtDay(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

const AVATAR_PALETTE = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
]
function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}
function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

declare global {
  interface Window { SpeechRecognition: typeof SpeechRecognition; webkitSpeechRecognition: typeof SpeechRecognition }
}

type Tab = 'notes' | 'documents' | 'search'
type MobileTab = 'info' | Tab

/* ─── main page ─── */
export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()

  const [account, setAccount] = useState<Account | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploaderMap, setUploaderMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('notes')
  const [mobileTab, setMobileTab] = useState<MobileTab>('info')

  // Info editing
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Account>>({})
  const [saving, setSaving] = useState(false)

  // Contact modal
  const [contactModal, setContactModal] = useState(false)
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', role: '', phone: '', email: '', notes: '', is_main_contact: false })
  const [savingContact, setSavingContact] = useState(false)

  // Note input
  const [noteTitle, setNoteTitle] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteMode, setNoteMode] = useState<'text' | 'vocal'>('text')
  const [recording, setRecording] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState('')
  const recognitionRef = { current: null as SpeechRecognition | null }

  // Document upload + management
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [openingDocId, setOpeningDocId] = useState<string | null>(null)
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // AI Search tab
  const [searchQuery, setSearchQuery] = useState('')
  const [searchAnswer, setSearchAnswer] = useState('')
  const [searchSources, setSearchSources] = useState<SearchSource[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchRecording, setSearchRecording] = useState(false)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)

  // Access section
  const [portfolioEntry, setPortfolioEntry] = useState<{ id: string; visibility: 'team' | 'private' | 'custom' } | null>(null)
  const [visibility, setVisibility] = useState<'team' | 'private' | 'custom'>('team')
  const [companyMembers, setCompanyMembers] = useState<{ id: string; full_name: string; email: string }[]>([])
  const [accessUserIds, setAccessUserIds] = useState<Set<string>>(new Set())
  const [savingAccess, setSavingAccess] = useState(false)

  /* ─── fetch ─── */
  const fetchAll = useCallback(async () => {
    const supabase = createClient()
    const [
      { data: acc },
      { data: ctcs },
      { data: nts },
      { data: docs },
    ] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('account_id', id).order('is_main_contact', { ascending: false }),
      supabase.from('notes').select('*').eq('account_id', id).eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('account_id', id).eq('is_deleted', false).order('created_at', { ascending: false }),
    ])
    setAccount(acc ?? null)
    if (acc) {
      try {
        const key = 'maimo_recent_accounts'
        const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string; name: string }[]
        const updated = [{ id: acc.id, name: acc.name }, ...stored.filter((a) => a.id !== acc.id)].slice(0, 5)
        localStorage.setItem(key, JSON.stringify(updated))
      } catch { /* ignore */ }
    }
    setContacts(ctcs ?? [])
    setNotes(nts ?? [])
    const docList = docs ?? []
    setDocuments(docList)

    // Fetch uploader names for documents
    if (docList.length > 0) {
      const uploaderIds = [...new Set(docList.map((d) => d.user_id).filter(Boolean))]
      if (uploaderIds.length > 0) {
        const { data: uploaders } = await supabase.from('users').select('id, full_name').in('id', uploaderIds)
        setUploaderMap(Object.fromEntries((uploaders ?? []).map((u) => [u.id, u.full_name])))
      }
    }

    setLoading(false)

    // Load portfolio entry for current user + access data
    if (profile) {
      const { data: entry } = await supabase
        .from('portfolio')
        .select('id, visibility')
        .eq('account_id', id)
        .eq('user_id', profile.id)
        .maybeSingle()

      if (entry) {
        setPortfolioEntry(entry as { id: string; visibility: 'team' | 'private' | 'custom' })
        setVisibility(entry.visibility as 'team' | 'private' | 'custom')
        const { data: accessRows } = await supabase
          .from('portfolio_access')
          .select('user_id')
          .eq('portfolio_id', entry.id)
        setAccessUserIds(new Set((accessRows ?? []).map((r: { user_id: string }) => r.user_id)))
      } else {
        setPortfolioEntry(null)
      }

      const { data: members } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('company_id', profile.company_id)
        .neq('id', profile.id)
      setCompanyMembers(members ?? [])
    }
  }, [id, profile])

  useEffect(() => { if (!profileLoading) fetchAll() }, [profileLoading, fetchAll])

  /* ─── account info ─── */
  const startEdit = () => { setEditData({ ...account }); setEditing(true) }
  const cancelEdit = () => setEditing(false)
  const saveEdit = async () => {
    if (!account) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('accounts').update(editData).eq('id', id).select().single()
    if (!error && data) { setAccount(data); setEditing(false) }
    setSaving(false)
  }

  /* ─── contacts ─── */
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !contactForm.first_name.trim() || !contactForm.last_name.trim()) return
    setSavingContact(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('contacts').insert({
      account_id: id,
      company_id: profile.company_id,
      ...contactForm,
      first_name: contactForm.first_name.trim(),
      last_name: contactForm.last_name.trim(),
    }).select().single()
    if (!error && data) { setContacts((prev) => [...prev, data]); setContactModal(false); setContactForm({ first_name: '', last_name: '', role: '', phone: '', email: '', notes: '', is_main_contact: false }) }
    setSavingContact(false)
  }

  const handleStatusToggle = async () => {
    if (!account) return
    const newStatus = account.status === 'prospect' ? 'client' : 'prospect'
    const supabase = createClient()
    await supabase.from('accounts').update({ status: newStatus }).eq('id', id)
    setAccount((prev) => prev ? { ...prev, status: newStatus } : prev)
  }

  const handleDeleteContact = async (contactId: string) => {
    const supabase = createClient()
    await supabase.from('contacts').delete().eq('id', contactId)
    setContacts((prev) => prev.filter((c) => c.id !== contactId))
  }

  /* ─── access ─── */
  const handleVisibilityChange = async (newVis: 'team' | 'private' | 'custom') => {
    if (!portfolioEntry) return
    setSavingAccess(true)
    setVisibility(newVis)
    const supabase = createClient()
    await supabase.from('portfolio').update({ visibility: newVis }).eq('id', portfolioEntry.id)
    setPortfolioEntry((prev) => prev ? { ...prev, visibility: newVis } : prev)
    setSavingAccess(false)
  }

  const toggleMemberAccess = async (memberId: string) => {
    if (!portfolioEntry) return
    const supabase = createClient()
    if (accessUserIds.has(memberId)) {
      await supabase.from('portfolio_access').delete().eq('portfolio_id', portfolioEntry.id).eq('user_id', memberId)
      setAccessUserIds((prev) => { const next = new Set(prev); next.delete(memberId); return next })
    } else {
      await supabase.from('portfolio_access').insert({ portfolio_id: portfolioEntry.id, user_id: memberId })
      setAccessUserIds((prev) => new Set([...prev, memberId]))
    }
  }

  /* ─── notes ─── */
  const saveNote = useCallback(async (content: string, source: 'text' | 'vocal') => {
    if (!content.trim() || !noteTitle.trim()) { setNoteError('Le titre est obligatoire.'); return }
    setNoteError(''); setSavingNote(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: note, error } = await supabase.from('notes').insert({
      account_id: id,
      company_id: profile?.company_id ?? null,
      user_id: profile?.id ?? user?.id ?? null,
      title: noteTitle.trim(),
      content: content.trim(),
      source,
      is_deleted: false,
    }).select().single()
    if (error) { setNoteError(error.message) }
    else if (note) {
      setNotes((prev) => [note, ...prev])
      setNoteTitle(''); setNoteText('')
      fetch('/api/index-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: note.id, content: note.content, account_id: id, company_id: profile?.company_id }),
      }).catch(console.error)
    }
    setSavingNote(false)
  }, [noteTitle, id, profile])

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Reconnaissance vocale non supportée.'); return }
    const r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true
    r.onresult = (e: SpeechRecognitionEvent) => {
      let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setNoteText(t)
    }
    r.onerror = () => setRecording(false)
    r.onend = () => setRecording(false)
    recognitionRef.current = r; r.start(); setRecording(true); setNoteMode('vocal')
  }, [])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop(); setRecording(false)
    if (noteText.trim()) saveNote(noteText, 'vocal')
  }, [noteText, saveNote])

  const handleDeleteNote = async (noteId: string) => {
    const supabase = createClient()
    await supabase.from('notes').update({ is_deleted: true }).eq('id', noteId)
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  /* ─── documents ─── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0 || !profile) return

    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    const invalid = files.filter((f) => !allowed.includes(f.type))
    if (invalid.length > 0) { setUploadError(`Format non supporté : ${invalid.map((f) => f.name).join(', ')}. Acceptés : PDF, DOCX, XLSX.`); return }

    const typeMap: Record<string, 'pdf' | 'docx' | 'xlsx'> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    }

    setUploadError(''); setUploading(true); setUploadMsg(''); setUploadProgress({ current: 0, total: files.length })
    const supabase = createClient()
    let lastMsg = ''

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadProgress({ current: i + 1, total: files.length })

      const ext = file.name.split('.').pop()
      const storagePath = `${profile.company_id}/${id}/${Date.now()}-${i}.${ext}`
      const titleFromName = file.name.replace(/\.[^.]+$/, '')

      const { error: storageError } = await supabase.storage.from('documents').upload(storagePath, file)
      if (storageError) { setUploadError(`Erreur pour ${file.name} : ${storageError.message}`); continue }

      const { data: doc } = await supabase.from('documents').insert({
        account_id: id,
        company_id: profile.company_id,
        user_id: profile.id,
        file_name: file.name,
        file_url: storagePath,
        file_type: typeMap[file.type],
        title: titleFromName,
        is_deleted: false,
      }).select().single()

      if (doc) {
        setDocuments((prev) => [doc, ...prev])
        setUploaderMap((prev) => ({ ...prev, [profile.id]: profile.full_name }))

        try {
          await fetch('/api/index-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_id: doc.id, file_url: storagePath, file_type: typeMap[file.type], account_id: id, company_id: profile.company_id }),
          })
          const extractRes = await fetch('/api/extract-account-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_id: doc.id, account_id: id, company_id: profile.company_id }),
          })
          const extractData = await extractRes.json()
          lastMsg = extractData.message ?? ''
        } catch {
          lastMsg = ''
        }
      }
    }

    setUploading(false)
    setUploadProgress(null)
    setUploadMsg(lastMsg || `${files.length} fichier${files.length > 1 ? 's' : ''} uploadé${files.length > 1 ? 's' : ''}.`)
    fetchAll()
    e.target.value = ''
  }

  const handleOpenDocument = async (doc: Document) => {
    setOpeningDocId(doc.id)
    try {
      const res = await fetch(`/api/documents/${doc.id}/url`)
      const { url } = await res.json()
      if (url) window.open(url, '_blank')
    } catch { /* nothing */ }
    setOpeningDocId(null)
  }

  const handleDeleteDocument = async (docId: string) => {
    setDeletingDocId(docId)
    const supabase = createClient()
    await supabase.from('chunks').delete().eq('source_id', docId).eq('source_type', 'document')
    await supabase.from('documents').update({ is_deleted: true }).eq('id', docId)
    setDocuments((prev) => prev.filter((d) => d.id !== docId))
    setConfirmDeleteDocId(null)
    setDeletingDocId(null)
  }

  const startRename = (doc: Document) => {
    setRenamingDocId(doc.id)
    setRenameValue(doc.title ?? doc.file_name.replace(/\.[^.]+$/, ''))
  }

  const confirmRename = async (docId: string) => {
    const newTitle = renameValue.trim()
    if (!newTitle) { setRenamingDocId(null); return }
    const supabase = createClient()
    await supabase.from('documents').update({ title: newTitle }).eq('id', docId)
    setDocuments((prev) => prev.map((d) => d.id === docId ? { ...d, title: newTitle } : d))
    setRenamingDocId(null)
  }

  /* ─── AI search ─── */
  const handleSearch = useCallback(async (q?: string) => {
    const query = q ?? searchQuery
    if (!query.trim()) return
    setSearchLoading(true); setSearchAnswer(''); setSearchSources([])
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, client_id: id, company_id: profile?.company_id }),
      })
      const data = await res.json()
      setSearchAnswer(data.answer ?? '')
      setSearchSources(data.sources ?? [])
    } catch { setSearchAnswer('Erreur lors de la recherche.') }
    setSearchLoading(false)
  }, [searchQuery, id, profile])

  const startSearchRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Reconnaissance vocale non supportée.'); return }
    const r = new SR(); r.lang = 'fr-FR'; r.continuous = false; r.interimResults = false
    r.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results[0][0].transcript; setSearchQuery(t); setSearchRecording(false); handleSearch(t)
    }
    r.onerror = () => setSearchRecording(false)
    r.onend = () => setSearchRecording(false)
    r.start(); setSearchRecording(true)
  }, [handleSearch])

  const speakAnswer = () => {
    if (!searchAnswer || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(searchAnswer); u.lang = 'fr-FR'
    window.speechSynthesis.speak(u)
  }

  /* ─── render ─── */
  if (loading) return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="h-8 w-48 bg-gray-100 rounded-xl animate-pulse" />
      <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
    </div>
  )
  if (!account) return <div className="p-4 text-center text-[#64748B]">Entreprise introuvable.</div>

  const infoFields: { key: keyof Account; label: string; placeholder?: string }[] = [
    { key: 'name', label: 'Raison sociale', placeholder: 'Entreprise Dupont' },
    { key: 'siret', label: 'SIRET', placeholder: '12345678901234' },
    { key: 'industry', label: 'Secteur d\'activité', placeholder: 'Charpente, toiture...' },
    { key: 'revenue', label: 'CA estimé', placeholder: '500k€' },
    { key: 'employees', label: 'Effectif', placeholder: '10-50' },
    { key: 'address', label: 'Adresse', placeholder: '12 rue de la Paix' },
    { key: 'city', label: 'Ville', placeholder: 'Lyon' },
    { key: 'postal_code', label: 'Code postal', placeholder: '69001' },
    { key: 'phone', label: 'Téléphone', placeholder: '04 72 ...' },
    { key: 'email', label: 'Email', placeholder: 'contact@...' },
    { key: 'website', label: 'Site web', placeholder: 'https://...' },
  ]

  const avatarColor = getAvatarColor(account.name)

  return (
    <div className="flex flex-col min-h-full">
      {/* Breadcrumb — desktop only */}
      <div className="hidden md:block px-6 pt-4 pb-0">
        <Breadcrumb items={[
          { label: 'MAIMO', href: '/app/dashboard' },
          { label: 'Mon portefeuille', href: '/app/portfolio' },
          { label: account.name },
        ]} />
      </div>

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30"
        style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}>
        <button onClick={() => router.back()} className="p-2 rounded-xl text-slate-400 hover:bg-[#F0F4FF] transition-all duration-200 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${avatarColor.bg} ${avatarColor.text}`}>
          {getInitials(account.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-semibold text-[#0F172A] truncate">{account.name}</h1>
            <button
              onClick={handleStatusToggle}
              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold transition-all duration-200 border"
              style={account.status === 'prospect' ? {
                background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                color: '#92400E',
                borderColor: 'rgba(245,158,11,0.2)',
              } : {
                background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                color: '#065F46',
                borderColor: 'rgba(16,185,129,0.2)',
              }}
            >
              {account.status === 'prospect' ? 'Prospect' : 'Client'}
            </button>
          </div>
          {(account.city || account.industry) && (
            <p className="text-xs text-slate-400">{[account.city, account.industry].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden flex border-b border-slate-100 bg-white sticky top-[57px] z-20">
        {([
          { value: 'info', label: 'Info' },
          { value: 'notes', label: 'Notes' },
          { value: 'documents', label: 'Docs' },
          { value: 'search', label: 'IA' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setMobileTab(value); if (value !== 'info') setTab(value as Tab) }}
            className={`flex-1 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
              mobileTab === value ? 'border-[#1E2761] text-[#1E2761]' : 'border-transparent text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">

        {/* ── LEFT COLUMN ── */}
        <div className={`border-b md:border-b-0 md:border-r border-slate-100 overflow-auto p-4 md:p-6 space-y-6 ${mobileTab !== 'info' ? 'hidden md:block' : ''}`}>

          {/* Account Info */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#1E293B]">Informations</h2>
              {editing ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                  <Button size="sm" loading={saving} onClick={saveEdit}><Save className="w-4 h-4 mr-1" />Sauvegarder</Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={startEdit}><Edit2 className="w-4 h-4 mr-1" />Modifier</Button>
              )}
            </div>

            <div className="space-y-3">
              {infoFields.map(({ key, label, placeholder }) => (
                editing ? (
                  <Input key={key} label={label} placeholder={placeholder}
                    value={(editData[key] as string) ?? ''}
                    onChange={(e) => setEditData((prev) => ({ ...prev, [key]: e.target.value || null }))} />
                ) : (account[key] ? (
                  <div key={key}>
                    <p className="text-xs text-[#94A3B8] mb-0.5">{label}</p>
                    <p className="text-sm text-[#1E293B]">{account[key] as string}</p>
                  </div>
                ) : null)
              ))}
              {!editing && infoFields.every(({ key }) => !account[key]) && (
                <p className="text-sm text-[#64748B]">Aucune information renseignée.</p>
              )}

              {/* Notes générales */}
              {editing ? (
                <div>
                  <label className="text-sm font-medium text-[#1E293B] block mb-1.5">Notes générales</label>
                  <textarea
                    value={(editData.notes_general as string) ?? ''}
                    onChange={(e) => setEditData((prev) => ({ ...prev, notes_general: e.target.value || null }))}
                    rows={3} placeholder="Observations générales..."
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                  />
                </div>
              ) : account.notes_general ? (
                <div>
                  <p className="text-xs text-[#94A3B8] mb-0.5">Notes générales</p>
                  <p className="text-sm text-[#1E293B] whitespace-pre-wrap">{account.notes_general}</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Contacts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#1E293B]">Interlocuteurs</h2>
              <Button size="sm" variant="secondary" onClick={() => setContactModal(true)}>
                <Plus className="w-4 h-4 mr-1" />Ajouter
              </Button>
            </div>

            {contacts.length === 0 ? (
              <p className="text-sm text-[#64748B]">Aucun interlocuteur.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#1E2761]/10 rounded-lg flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-[#1E2761]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-[#1E293B]">{c.first_name} {c.last_name}</p>
                            {c.is_main_contact && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-xs font-medium rounded-lg">
                                <Star className="w-2.5 h-2.5" />Principal
                              </span>
                            )}
                          </div>
                          {c.phone && <p className="text-xs text-[#64748B]">{c.phone}</p>}
                          {c.email && <p className="text-xs text-[#3B82F6]">{c.email}</p>}
                          {c.role && <p className="text-xs text-slate-500 italic mt-0.5">{c.role}</p>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteContact(c.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {c.notes && <p className="text-xs text-[#64748B] mt-2 pt-2 border-t border-gray-100">{c.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Access */}
          {portfolioEntry && (
            <div>
              <h2 className="text-sm font-semibold text-[#1E293B] mb-3">Accès</h2>
              <div className="space-y-2">
                {([
                  { value: 'team', icon: Globe, label: "Toute l'équipe", desc: 'Tous les membres voient cette fiche' },
                  { value: 'private', icon: Lock, label: 'Privé', desc: 'Moi seul' },
                  { value: 'custom', icon: Users, label: 'Personnes choisies', desc: 'Sélectionner des membres' },
                ] as const).map(({ value, icon: Icon, label, desc }) => (
                  <button
                    key={value}
                    onClick={() => handleVisibilityChange(value)}
                    disabled={savingAccess}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 text-left ${
                      visibility === value
                        ? 'border-[#1E2761] bg-[#1E2761]/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${visibility === value ? 'text-[#1E2761]' : 'text-[#64748B]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${visibility === value ? 'text-[#1E2761]' : 'text-[#1E293B]'}`}>{label}</p>
                      <p className="text-xs text-[#64748B]">{desc}</p>
                    </div>
                    {visibility === value && <div className="w-2 h-2 rounded-full bg-[#1E2761] shrink-0" />}
                  </button>
                ))}
              </div>

              {visibility === 'custom' && companyMembers.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-[#64748B] font-medium mb-2">Membres avec accès</p>
                  {companyMembers.map((member) => (
                    <label key={member.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={accessUserIds.has(member.id)}
                        onChange={() => toggleMemberAccess(member.id)}
                        className="rounded"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-[#1E293B] truncate">{member.full_name}</p>
                        <p className="text-xs text-[#94A3B8] truncate">{member.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className={`flex flex-col min-h-0 ${mobileTab === 'info' ? 'hidden md:flex' : ''}`}>
          {/* Desktop tabs */}
          <div className="hidden md:flex border-b border-slate-100 bg-white">
            {(['notes', 'documents', 'search'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${tab === t ? 'border-[#1E2761] text-[#1E2761]' : 'border-transparent text-slate-400 hover:text-[#0F172A]'}`}
              >
                {t === 'notes' && <><FileText className="w-4 h-4" />Notes</>}
                {t === 'documents' && <><Upload className="w-4 h-4" />Documents</>}
                {t === 'search' && <><Search className="w-4 h-4" />IA</>}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">

            {/* ── NOTES TAB ── */}
            {tab === 'notes' && (
              <>
                {/* Note input */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <div className="flex gap-2">
                    {(['text', 'vocal'] as const).map((m) => (
                      <button key={m} onClick={() => setNoteMode(m)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${noteMode === m ? 'bg-[#1E2761] text-white' : 'text-[#64748B] hover:bg-gray-100'}`}>
                        {m === 'text' ? <><Type className="w-3.5 h-3.5" />Texte</> : <><Mic className="w-3.5 h-3.5" />Vocal</>}
                      </button>
                    ))}
                  </div>
                  <Input placeholder="Titre de la note (obligatoire)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
                  {noteMode === 'text' ? (
                    <form onSubmit={(e) => { e.preventDefault(); saveNote(noteText, 'text') }} className="space-y-2">
                      <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Contenu de la note..." rows={3}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent" />
                      {noteError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{noteError}</p>}
                      <Button type="submit" loading={savingNote} disabled={!noteText.trim() || !noteTitle.trim()} className="w-full" size="sm">
                        <Send className="w-3.5 h-3.5 mr-1.5" />Enregistrer
                      </Button>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      {noteText && (
                        <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-[#1E293B] min-h-[60px]">
                          {noteText}
                          {recording && <span className="inline-block w-2 h-4 bg-red-500 ml-1 animate-pulse rounded-sm" />}
                        </div>
                      )}
                      {noteError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{noteError}</p>}
                      {!recording ? (
                        <button onClick={startRecording} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-500 font-medium text-sm hover:bg-red-100 transition-all duration-150">
                          <Mic className="w-5 h-5" />Démarrer l'enregistrement
                        </button>
                      ) : (
                        <button onClick={stopRecording} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 animate-pulse">
                          <MicOff className="w-5 h-5" />Arrêter et sauvegarder
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes list */}
                {notes.length === 0 ? (
                  <div className="text-center py-8"><FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" /><p className="text-sm text-[#64748B]">Aucune note</p></div>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <NoteCard key={note.id} note={note} onDelete={handleDeleteNote} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── DOCUMENTS TAB ── */}
            {tab === 'documents' && (
              <>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                  {uploadError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{uploadError}</p>}
                  {uploadMsg && !uploading && <p className="text-xs text-[#10B981] bg-green-50 px-3 py-2 rounded-lg">{uploadMsg}</p>}
                  {uploadProgress && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[#64748B]">
                        <span>Traitement en cours…</span>
                        <span className="font-medium">{uploadProgress.current}/{uploadProgress.total} fichiers</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3B82F6] rounded-full transition-all duration-300"
                          style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <label className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all duration-150 cursor-pointer ${!uploading ? 'border-[#3B82F6] text-[#3B82F6] hover:bg-blue-50' : 'border-gray-200 text-[#94A3B8] cursor-not-allowed'}`}>
                    <input type="file" accept=".pdf,.docx,.xlsx" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                    {uploading
                      ? <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Traitement…</>
                      : <><Upload className="w-4 h-4" />Choisir des fichiers (PDF, DOCX, XLSX)</>}
                  </label>
                </div>

                {documents.length === 0 ? (
                  <div className="text-center py-8"><Upload className="w-10 h-10 text-gray-200 mx-auto mb-2" /><p className="text-sm text-[#64748B]">Aucun document</p></div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => {
                      const iconColor = doc.file_type === 'pdf' ? 'bg-red-50 text-red-600' : doc.file_type === 'docx' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                      const isConfirming = confirmDeleteDocId === doc.id
                      const isDeleting = deletingDocId === doc.id
                      const isOpening = openingDocId === doc.id
                      const isRenaming = renamingDocId === doc.id
                      return (
                        <div key={doc.id} className="bg-white rounded-xl border border-gray-100 p-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
                              <span className="text-xs font-bold uppercase">{doc.file_type}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {isRenaming ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmRename(doc.id)
                                    if (e.key === 'Escape') setRenamingDocId(null)
                                  }}
                                  className="w-full px-2 py-1 text-sm text-[#1E293B] border border-[#3B82F6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                                />
                              ) : (
                                <p className="text-sm font-medium text-[#1E293B] truncate">{doc.title ?? doc.file_name}</p>
                              )}
                              <p className="text-xs text-[#64748B] truncate">{doc.file_name}</p>
                              <p className="text-xs text-[#94A3B8]">
                                {uploaderMap[doc.user_id] ?? 'Inconnu'} · {fmtDay(doc.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                            <button
                              onClick={() => handleOpenDocument(doc)}
                              disabled={isOpening}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#3B82F6] bg-blue-50 hover:bg-blue-100 transition-all duration-150"
                            >
                              {isOpening ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                              Ouvrir
                            </button>
                            {isRenaming ? (
                              <div className="flex gap-1.5">
                                <button onClick={() => confirmRename(doc.id)} className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#3B82F6] rounded-lg hover:bg-blue-600">OK</button>
                                <button onClick={() => setRenamingDocId(null)} className="px-2.5 py-1.5 text-xs font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => startRename(doc)} className="p-1.5 rounded-lg text-gray-300 hover:text-[#3B82F6] hover:bg-blue-50 transition-all duration-150">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isConfirming ? (
                              <div className="flex gap-1.5 ml-auto">
                                <button
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  disabled={isDeleting}
                                  className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600"
                                >
                                  {isDeleting ? '…' : 'Supprimer'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteDocId(null)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteDocId(doc.id)}
                                className="ml-auto p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── AI SEARCH TAB ── */}
            {tab === 'search' && (
              <>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Posez une question sur ce client..."
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent" />
                    <button onClick={searchRecording ? () => setSearchRecording(false) : startSearchRecording}
                      className={`p-2.5 rounded-xl transition-all duration-150 ${searchRecording ? 'bg-red-500 text-white animate-pulse' : 'border border-gray-200 text-[#64748B] hover:bg-gray-50'}`}>
                      {searchRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>
                  <Button onClick={() => handleSearch()} loading={searchLoading} disabled={!searchQuery.trim()} className="w-full">
                    <Search className="w-4 h-4 mr-2" />Rechercher
                  </Button>
                </div>

                {searchLoading && (
                  <div className="flex items-center justify-center gap-2 py-8">
                    <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce" />
                  </div>
                )}

                {searchAnswer && !searchLoading && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Réponse</span>
                      <button onClick={speakAnswer} className="p-1.5 rounded-lg text-[#64748B] hover:bg-gray-100">
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{searchAnswer}</p>

                    {searchSources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs font-medium text-[#64748B] mb-2">Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {searchSources.map((src) => (
                            <button key={src.id}
                              onClick={() => {
                                if (src.type === 'document' && src.url) window.open(src.url, '_blank')
                                else setExpandedSource(expandedSource === src.id ? null : src.id)
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E2761]/5 text-xs font-medium text-[#1E2761] hover:bg-[#1E2761]/10 transition-all duration-150"
                            >
                              {src.type === 'document' ? <ExternalLink className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                              {src.title}
                              {src.date && <span className="text-[#94A3B8]">· {fmtDay(src.date)}</span>}
                            </button>
                          ))}
                        </div>
                        {expandedSource && (() => {
                          const src = searchSources.find((s) => s.id === expandedSource)
                          return src ? (
                            <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                              <p className="text-xs font-medium text-[#1E293B] mb-1">{src.title}</p>
                              {src.author && <p className="text-xs text-[#64748B]">Par {src.author}{src.date ? ` · ${fmtDay(src.date)}` : ''}</p>}
                            </div>
                          ) : null
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Contact modal */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Ajouter un interlocuteur">
        <form onSubmit={handleAddContact} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prénom" placeholder="Jean" value={contactForm.first_name} onChange={(e) => setContactForm((p) => ({ ...p, first_name: e.target.value }))} required autoFocus />
            <Input label="Nom" placeholder="Dupont" value={contactForm.last_name} onChange={(e) => setContactForm((p) => ({ ...p, last_name: e.target.value }))} required />
          </div>
          <Input label="Rôle" placeholder="Acheteur, Dirigeant..." value={contactForm.role} onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))} />
          <Input label="Téléphone" placeholder="06 ..." value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} />
          <Input label="Email" type="email" placeholder="jean@..." value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[#1E293B]">Notes</label>
            <textarea value={contactForm.notes} onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2} placeholder="Observations..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={contactForm.is_main_contact} onChange={(e) => setContactForm((p) => ({ ...p, is_main_contact: e.target.checked }))} className="rounded" />
            <span className="text-sm text-[#1E293B]">Contact principal</span>
          </label>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setContactModal(false)} className="flex-1">Annuler</Button>
            <Button type="submit" loading={savingContact} className="flex-1">Ajouter</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/* ─── NoteCard inline ─── */
function NoteCard({ note, onDelete }: { note: Note; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${note.source === 'vocal' ? 'bg-red-50' : 'bg-blue-50'}`}>
            {note.source === 'vocal' ? <Mic className="w-3.5 h-3.5 text-red-500" /> : <Type className="w-3.5 h-3.5 text-[#3B82F6]" />}
          </div>
          <div>
            {note.title && <p className="text-xs font-semibold text-[#1E293B]">{note.title}</p>}
            <p className="text-xs text-[#94A3B8]">{new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(note.created_at))}</p>
          </div>
        </div>
        {confirming ? (
          <div className="flex gap-1">
            <button onClick={() => onDelete(note.id)} className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600">Supprimer</button>
            <button onClick={() => setConfirming(false)} className="px-2 py-1 text-xs font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{note.content}</p>
    </div>
  )
}

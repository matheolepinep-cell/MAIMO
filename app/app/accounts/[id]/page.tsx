'use client'

import { useEffect, useState, use, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Edit2, Save, X, Plus, Trash2, Mic, MicOff, Send, Type,
  FileText, Search, User, Star, Volume2, Globe, Lock, Users, Paperclip, Camera, ImageIcon, ExternalLink, Upload, Download, Share2, Bell, BellOff, AlertTriangle, Copy
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Modal } from '@/components/ui/Modal'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { Account, Contact, Note, Document, SearchSource } from '@/types/database'
import { detectConflicts, type ConflictResult } from '@/lib/conflicts'

/* ─── helpers ─── */
function docTypeColor(type: string) {
  if (type === 'pdf') return '#EF4444'
  if (type === 'docx') return '#3B82F6'
  if (type === 'xlsx') return '#10B981'
  if (type === 'image') return '#8B5CF6'
  return '#94A3B8'
}
function docTypeBg(type: string) {
  if (type === 'pdf') return 'rgba(239,68,68,0.1)'
  if (type === 'docx') return 'rgba(59,130,246,0.1)'
  if (type === 'xlsx') return 'rgba(16,185,129,0.1)'
  if (type === 'image') return 'rgba(139,92,246,0.1)'
  return 'rgba(148,163,184,0.1)'
}

function fmt(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
}
function fmtDay(d: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

declare global {
  interface Window { SpeechRecognition: typeof SpeechRecognition; webkitSpeechRecognition: typeof SpeechRecognition }
}

type Tab = 'notes' | 'search'
type MobileTab = 'info' | Tab
type AttachItem = { id: string; file: File; preview?: string }

/* ─── main page ─── */
export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor } = useAccentColor()

  const [account, setAccount] = useState<Account | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
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
  const [conflictChecking, setConflictChecking] = useState(false)
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null)
  const [pendingNote, setPendingNote] = useState<{ content: string; source: 'text' | 'vocal' } | null>(null)
  const forceSaveRef = useRef(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Attachments (pièces jointes dans les notes)
  const [attachments, setAttachments] = useState<AttachItem[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)

  // Standalone document upload
  const [docUploading, setDocUploading] = useState(false)
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null)

  // Document preview modal
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoadingDocId, setPreviewLoadingDocId] = useState<string | null>(null)

  // AI Search tab
  const [searchQuery, setSearchQuery] = useState('')
  const [searchAnswer, setSearchAnswer] = useState('')
  const [searchSources, setSearchSources] = useState<SearchSource[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchRecording, setSearchRecording] = useState(false)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)

  // Notification mute
  const [isMuted, setIsMuted] = useState(false)

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
    setDocuments(docs ?? [])
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

      const { data: mutedRow } = await supabase
        .from('muted_companies')
        .select('id')
        .eq('user_id', profile.id)
        .eq('company_id', id)
        .maybeSingle()
      setIsMuted(!!mutedRow)
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

  /* ─── notification mute ─── */
  const handleToggleMute = async () => {
    if (!profile) return
    const supabase = createClient()
    if (isMuted) {
      await supabase.from('muted_companies').delete().eq('user_id', profile.id).eq('company_id', id)
    } else {
      await supabase.from('muted_companies').insert({ user_id: profile.id, company_id: id })
    }
    setIsMuted((v) => !v)
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
    setNoteError('')

    // Conflict detection (skip if force-save flagged)
    if (!forceSaveRef.current) {
      setConflictChecking(true)
      const result = await detectConflicts(id, content)
      setConflictChecking(false)
      if (result.hasConflict || result.hasDuplicate) {
        setConflictResult(result)
        setPendingNote({ content, source })
        return
      }
    }
    forceSaveRef.current = false
    setConflictResult(null)
    setPendingNote(null)

    setSavingNote(true)
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
      fetch('/api/notifications/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, noteTitle: note.title, accountName: account?.name }),
      }).catch(console.error)
      // Upload pièces jointes
      if (attachments.length > 0) {
        setUploadingAttachments(true)
        const sb = createClient()
        for (const item of attachments) {
          const { file } = item
          const filePath = `${profile?.company_id}/${id}/${note.id}/${Date.now()}-${file.name}`
          const { error: storErr } = await sb.storage.from('imports').upload(filePath, file)
          if (storErr) continue
          const isImage = file.type.startsWith('image/')
          const fileType: 'pdf' | 'docx' | 'xlsx' | 'image' = isImage ? 'image'
            : file.type.includes('pdf') ? 'pdf'
            : file.type.includes('wordprocessing') ? 'docx' : 'xlsx'
          const { data: insertedDoc } = await sb.from('documents').insert({
            account_id: id, company_id: profile?.company_id, user_id: profile?.id,
            note_id: note.id, file_name: file.name, file_url: filePath, file_type: fileType,
            title: file.name.replace(/\.[^.]+$/, ''), is_deleted: false,
          }).select().single()
          if (!isImage && insertedDoc) {
            fetch('/api/index-document', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ document_id: insertedDoc.id, file_url: filePath, file_type: fileType, account_id: id, company_id: profile?.company_id }),
            }).catch(console.error)
          }
        }
        setAttachments([])
        setUploadingAttachments(false)
        fetchAll()
      }
    }
    setSavingNote(false)
  }, [noteTitle, id, profile, attachments, fetchAll])

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

  /* ─── attachments ─── */
  const handleAddAttachments = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    files.forEach(file => {
      const itemId = `${Date.now()}-${Math.random()}`
      setAttachments(prev => [...prev, { id: itemId, file }])
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const preview = ev.target?.result as string
          setAttachments(prev => prev.map(a => a.id === itemId ? { ...a, preview } : a))
        }
        reader.readAsDataURL(file)
      }
    })
    e.target.value = ''
  }

  const removeAttachment = (itemId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== itemId))
  }

  const handleOpenDocument = async (doc: Document) => {
    setPreviewLoadingDocId(doc.id)
    try {
      const res = await fetch(`/api/documents/${doc.id}/url`)
      const { url } = await res.json()
      if (url) { setPreviewDoc(doc); setPreviewUrl(url) }
    } catch { /* nothing */ }
    setPreviewLoadingDocId(null)
  }

  const handleDeleteDocument = async (docId: string) => {
    const supabase = createClient()
    await supabase.from('documents').update({ is_deleted: true }).eq('id', docId)
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  const handleStandaloneDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !profile) return
    setDocUploading(true)
    const sb = createClient()
    for (const file of files) {
      const filePath = `${profile.company_id}/${Date.now()}-${file.name}`
      const { error: storErr } = await sb.storage.from('documents').upload(filePath, file)
      if (storErr) continue
      const isImage = file.type.startsWith('image/')
      const fileType: 'pdf' | 'docx' | 'xlsx' | 'image' = isImage ? 'image'
        : file.type.includes('pdf') ? 'pdf'
        : file.type.includes('wordprocessing') ? 'docx' : 'xlsx'
      const { data: standaloneDoc } = await sb.from('documents').insert({
        account_id: id, company_id: profile.company_id, user_id: profile.id,
        note_id: null, file_name: file.name, file_url: filePath,
        file_type: fileType, title: file.name.replace(/\.[^.]+$/, ''), is_deleted: false,
      }).select().single()
      if (!isImage && standaloneDoc) {
        fetch('/api/index-document', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: standaloneDoc.id, file_url: filePath, file_type: fileType, account_id: id, company_id: profile.company_id }),
        }).catch(console.error)
      }
      fetch('/api/notifications/document', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, fileName: file.name, accountName: account?.name }),
      }).catch(console.error)
    }
    e.target.value = ''
    setDocUploading(false)
    fetchAll()
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

  return (
    <div className="flex flex-col min-h-full">
      {/* Breadcrumb — desktop only */}
      <div className="hidden md:block px-6 pt-4 pb-0">
        <Breadcrumb items={[
          { label: 'MAIMOO', href: '/app/dashboard' },
          { label: 'Mon portefeuille', href: '/app/portfolio' },
          { label: account.name },
        ]} />
      </div>

      {/* Header */}
      <div className="bg-white px-4 pl-14 md:pl-4 py-3 flex items-center gap-3 sticky top-0 z-30"
        style={{ borderBottom: '1px solid rgba(30,39,97,0.08)' }}>
        <button onClick={() => router.back()} className="p-2 rounded-xl text-slate-400 hover:bg-[#F0F4FF] transition-all duration-200 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
          style={{ background: accentColor }}>
          {getInitials(account.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-semibold text-[#0F172A] truncate">{account.name}</h1>
            <button
              onClick={handleStatusToggle}
              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold transition-all duration-200 border"
              style={account.status === 'prospect' ? {
                background: 'rgba(30,39,97,0.05)',
                color: 'rgba(30,39,97,0.5)',
                borderColor: 'rgba(30,39,97,0.1)',
              } : {
                background: 'rgba(30,39,97,0.12)',
                color: '#1E2761',
                borderColor: 'rgba(30,39,97,0.2)',
              }}
            >
              {account.status === 'prospect' ? 'Prospect' : 'Client'}
            </button>
          </div>
          {(account.city || account.industry) && (
            <p className="text-xs text-slate-400">{[account.city, account.industry].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <button
          onClick={handleToggleMute}
          title={isMuted ? 'Réactiver les notifications' : 'Désactiver les notifications'}
          className="p-2 rounded-xl transition-all duration-200 shrink-0"
          style={{ color: isMuted ? '#94A3B8' : accentColor, background: isMuted ? 'transparent' : `${accentColor}15` }}
        >
          {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden flex gap-1.5 px-4 py-2.5 bg-white border-b border-slate-100 sticky top-[57px] z-20">
        {([
          { value: 'info', label: 'Info' },
          { value: 'notes', label: 'Notes' },
          { value: 'search', label: 'IA' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setMobileTab(value); if (value !== 'info') setTab(value as Tab) }}
            className={`flex-1 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              mobileTab === value ? 'bg-[#1E2761] text-white' : 'text-[#64748B] bg-[#F0F4FF]'
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
                <Button variant="secondary" size="sm" onClick={startEdit} className="w-full md:w-auto"><Edit2 className="w-4 h-4 mr-1" />Modifier</Button>
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

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#1E293B]">Documents ({documents.length})</h2>
              <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#4C6EF5] bg-[#F0F4FF] hover:bg-[#E8EEFF] cursor-pointer transition-all duration-150">
                {docUploading
                  ? <span className="w-3 h-3 border-2 border-[#4C6EF5] border-t-transparent rounded-full animate-spin" />
                  : <><Upload className="w-3 h-3 mr-0.5" />Ajouter</>
                }
                <input type="file" multiple className="hidden" onChange={handleStandaloneDocUpload} disabled={docUploading} />
              </label>
            </div>
            {documents.length === 0 ? (
              <p className="text-sm text-[#64748B]">Aucun document.</p>
            ) : (
              <div className="space-y-1.5">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-1 rounded-xl transition-all duration-150 hover:bg-gray-50"
                    style={{ border: '1px solid rgba(30,39,97,0.07)' }}
                  >
                    {/* Clickable open area */}
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      disabled={previewLoadingDocId === doc.id}
                      className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left min-w-0"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: docTypeBg(doc.file_type) }}>
                        {previewLoadingDocId === doc.id
                          ? <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: docTypeColor(doc.file_type), borderTopColor: 'transparent' }} />
                          : doc.file_type === 'image'
                            ? <ImageIcon className="w-4 h-4" style={{ color: docTypeColor(doc.file_type) }} />
                            : <FileText className="w-4 h-4" style={{ color: docTypeColor(doc.file_type) }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#1E293B] truncate">{doc.title ?? doc.file_name}</p>
                        <p className="text-[10px] text-[#94A3B8]">{fmtDay(doc.created_at)}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-[#C5D0F0] shrink-0" />
                    </button>
                    {/* Delete */}
                    {confirmDeleteDocId === doc.id ? (
                      <div className="flex items-center gap-1 pr-2 shrink-0">
                        <button onClick={() => { handleDeleteDocument(doc.id); setConfirmDeleteDocId(null) }} className="px-2 py-1 text-[10px] font-medium text-white bg-red-500 rounded-lg hover:bg-red-600">Sup.</button>
                        <button onClick={() => setConfirmDeleteDocId(null)} className="px-2 py-1 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteDocId(doc.id)} className="p-1.5 mr-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
          <div className="hidden md:flex gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-white">
            {([
              { value: 'notes' as Tab, label: 'Notes', icon: FileText },
              { value: 'search' as Tab, label: 'IA', icon: Search },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${tab === value ? 'bg-[#1E2761] text-white' : 'text-[#64748B] bg-[#F0F4FF]'}`}
              >
                <Icon className="w-3.5 h-3.5" />{label}
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
                      {conflictChecking && (
                        <p className="text-xs text-[#64748B] flex items-center gap-1.5">
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Analyse en cours…
                        </p>
                      )}
                      {conflictResult ? (
                        <div className="rounded-xl border px-4 py-3 space-y-2" style={{ background: '#FEF9C3', borderColor: '#EAB308' }}>
                          <div className="flex items-start gap-2">
                            {conflictResult.hasConflict
                              ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#854D0E' }} />
                              : <Copy className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#854D0E' }} />}
                            <p className="text-xs text-[#713F12] leading-relaxed">
                              {conflictResult.hasConflict && conflictResult.conflicts[0]
                                ? <>Information contradictoire : <span className="font-medium">&ldquo;{conflictResult.conflicts[0].existingInfo}&rdquo;</span> → <span className="font-medium">&ldquo;{conflictResult.conflicts[0].newInfo}&rdquo;</span></>
                                : "Cette information existe déjà dans une note précédente."}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={() => { if (pendingNote) { forceSaveRef.current = true; saveNote(pendingNote.content, pendingNote.source) } }}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#EAB308' }}>
                              Sauvegarder quand même
                            </button>
                            <button type="button"
                              onClick={() => { setConflictResult(null); setPendingNote(null) }}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold border bg-white" style={{ color: '#713F12', borderColor: '#EAB308' }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Button type="submit" loading={savingNote || conflictChecking} disabled={!noteText.trim() || !noteTitle.trim()} className="w-full" size="sm">
                          <Send className="w-3.5 h-3.5 mr-1.5" />Enregistrer
                        </Button>
                      )}
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
                  {/* Pièces jointes */}
                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all">
                      <Paperclip className="w-3.5 h-3.5" />Fichier
                      <input type="file" multiple className="hidden" onChange={handleAddAttachments} />
                    </label>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all">
                      <Camera className="w-3.5 h-3.5" />Photo
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAddAttachments} />
                    </label>
                    {uploadingAttachments && (
                      <span className="flex items-center gap-1 text-xs text-[#64748B]">
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />Upload…
                      </span>
                    )}
                  </div>
                  {attachments.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {attachments.map(item => (
                        <div key={item.id} className="relative group">
                          {item.preview ? (
                            <img src={item.preview} alt={item.file.name} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                          ) : (
                            <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-gray-300" />
                            </div>
                          )}
                          <p className="text-[10px] text-[#64748B] truncate w-16 mt-0.5">{item.file.name}</p>
                          <button onClick={() => removeAttachment(item.id)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes list */}
                {notes.length === 0 ? (
                  <div className="text-center py-8"><FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" /><p className="text-sm text-[#64748B]">Aucune note</p></div>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        noteDocuments={documents.filter(d => d.note_id === note.id && !d.is_deleted)}
                        onDelete={handleDeleteNote}
                        onOpenDoc={handleOpenDocument}
                      />
                    ))}
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

      {/* Document preview modal */}
      {previewDoc && previewUrl && (
        <DocPreviewModal
          doc={previewDoc}
          url={previewUrl}
          onClose={() => { setPreviewDoc(null); setPreviewUrl(null) }}
        />
      )}
    </div>
  )
}

/* ─── NoteCard inline ─── */
function NoteCard({ note, noteDocuments, onDelete, onOpenDoc }: {
  note: Note
  noteDocuments: Document[]
  onDelete: (id: string) => void
  onOpenDoc: (doc: Document) => void
}) {
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
      {noteDocuments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
          {noteDocuments.map(doc => (
            <button
              key={doc.id}
              onClick={() => onOpenDoc(doc)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-all duration-150 max-w-[160px]"
            >
              {doc.file_type === 'image'
                ? <ImageIcon className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                : <ExternalLink className="w-3.5 h-3.5 text-[#64748B] shrink-0" />}
              <span className="text-xs text-[#64748B] truncate">{doc.title ?? doc.file_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── DocPreviewModal ─── */
function DocPreviewModal({ doc, url, onClose }: { doc: Document; url: string; onClose: () => void }) {
  const { profile } = useUser()
  const [isMobile, setIsMobile] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([])
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const isImage = doc.file_type === 'image'
  const isPdf = doc.file_type === 'pdf'
  const isOffice = doc.file_type === 'docx' || doc.file_type === 'xlsx'
  const usesIframe = isPdf || isOffice

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    if (!usesIframe) return
    setIframeLoaded(false)
    setIframeFailed(false)
    const timer = setTimeout(() => setIframeFailed(true), 5000)
    return () => clearTimeout(timer)
  }, [usesIframe, url])

  useEffect(() => {
    if (!shareOpen || !profile?.company_id || teamMembers.length > 0) return
    const supabase = createClient()
    supabase
      .from('users')
      .select('id, full_name')
      .eq('company_id', profile.company_id)
      .neq('id', profile.id)
      .then(({ data }) => setTeamMembers(data ?? []))
  }, [shareOpen, profile, teamMembers.length])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const file = new File([blob], doc.file_name, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.file_name })
        return
      }
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  const handleSystemShare = async () => {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const file = new File([blob], doc.file_name, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.file_name })
        setShareOpen(false)
        return
      }
    } catch { /* fall through */ }
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('Lien copié dans le presse-papier')
    } catch {
      setShareStatus('Impossible de copier le lien')
    }
    setTimeout(() => setShareStatus(null), 3000)
  }

  const handleInternalShare = async (member: { id: string; full_name: string }) => {
    try {
      await fetch('/api/notifications/share-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: member.id, documentId: doc.id, documentName: doc.title ?? doc.file_name, filePath: doc.file_url, fileType: doc.file_type }),
      })
    } catch { /* best-effort */ }
    setShareStatus(`Document partagé avec ${member.full_name}`)
    setTimeout(() => { setShareStatus(null); setShareOpen(false) }, 2000)
  }

  const gdocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
  const iframeSrc = isPdf && !isMobile ? url : gdocsUrl

  return (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.85)' }}
        onClick={onClose}
      >
        <div
          className="relative flex flex-col w-full h-full md:w-[80vw] md:h-[85vh] md:rounded-2xl overflow-hidden"
          style={{ background: '#fff' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
            <FileText className="w-4 h-4 text-[#64748B] shrink-0" />
            <span className="flex-1 text-sm font-medium text-[#1E293B] truncate min-w-0">
              {doc.title ?? doc.file_name}
            </span>
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-all duration-150 shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Partager</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-all duration-150 shrink-0 disabled:opacity-60"
            >
              {downloading
                ? <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Télécharger</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Image */}
          {isImage && (
            <div className="flex-1 flex items-center justify-center overflow-auto" style={{ background: '#111' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={doc.title ?? doc.file_name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', touchAction: 'manipulation' }}
              />
            </div>
          )}

          {/* PDF / Office via iframe */}
          {usesIframe && !iframeFailed && (
            <div className="flex-1 relative flex flex-col min-h-0">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
                </div>
              )}
              <iframe
                src={iframeSrc}
                className="flex-1 w-full border-0 min-h-0"
                title={doc.title ?? doc.file_name}
                onLoad={() => setIframeLoaded(true)}
                onError={() => setIframeFailed(true)}
              />
              {isOffice && (
                <p className="text-center text-[10px] text-[#94A3B8] py-1 shrink-0">
                  Prévisualisation via Google Docs
                </p>
              )}
            </div>
          )}

          {/* Iframe fallback */}
          {usesIframe && iframeFailed && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <FileText className="w-12 h-12 text-[#CBD5E1]" />
              <p className="text-sm font-medium text-[#1E293B] text-center">{doc.title ?? doc.file_name}</p>
              <p className="text-xs text-[#94A3B8] text-center">
                {isPdf ? "La prévisualisation PDF n'est pas disponible." : "La prévisualisation n'est pas disponible."}
              </p>
              <button
                onClick={() => window.open(url, '_blank')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all duration-150"
                style={{ background: '#3B82F6' }}
              >
                <ExternalLink className="w-4 h-4" />
                Ouvrir dans Safari →
              </button>
            </div>
          )}

          {/* Unsupported type */}
          {!isPdf && !isImage && !isOffice && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <FileText className="w-12 h-12 text-[#CBD5E1]" />
              <p className="text-sm font-medium text-[#1E293B] text-center">{doc.title ?? doc.file_name}</p>
              <p className="text-xs text-[#94A3B8] text-center">
                Ce type de fichier ne peut pas être prévisualisé directement.
              </p>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all duration-150"
                style={{ background: '#3B82F6' }}
              >
                <Download className="w-4 h-4" />
                Télécharger le fichier
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Share bottom sheet */}
      <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title="Partager le document">
        {shareStatus && (
          <div className="mb-4 px-3 py-2 rounded-xl text-sm font-medium text-center" style={{ background: '#F0FDF4', color: '#16A34A' }}>
            {shareStatus}
          </div>
        )}

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
            Partager en interne
          </p>
          {teamMembers.length === 0 ? (
            <p className="text-sm text-center py-2" style={{ color: '#94A3B8' }}>Aucun autre membre dans l'équipe</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teamMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleInternalShare(m)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all duration-150 text-left w-full"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#3B82F6' }}>
                    <span className="text-xs font-bold text-white">
                      {m.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-[#1E293B]">{m.full_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
            Partager via le système
          </p>
          <button
            onClick={handleSystemShare}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all duration-150"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#8B5CF6' }}>
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-[#1E293B]">Partager via...</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>Mail, Messages, WhatsApp, AirDrop...</p>
            </div>
          </button>
        </div>
      </BottomSheet>
    </>
  )
}

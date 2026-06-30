'use client'

import { useEffect, useState, use, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Edit2, Save, X, Plus, Trash2, Mic, MicOff, Send, Type,
  FileText, Search, User, Star, Volume2, Globe, Lock, Users, Paperclip, Camera, ImageIcon, ExternalLink, Upload, Download, Share2, Bell, BellOff, AlertTriangle, Copy, Phone, Mail,
  ChevronLeft, ChevronRight, MoreVertical
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useAccentColor } from '@/contexts/AccentColorContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormMessage } from '@/components/ui/FormMessage'
import { CityInput } from '@/components/ui/CityInput'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Modal } from '@/components/ui/Modal'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { NoteCard } from '@/components/notes/NoteCard'
import type { Account, Contact, Note, Document, SearchSource } from '@/types/database'
import { detectConflicts, type ConflictResult } from '@/lib/conflicts'
import { validateFile, sanitizeFilename } from '@/lib/file-validation'

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
function formatNoteDatetime(d: string) {
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d))
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(d))
  return `${date} · ${time}`
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

/* ─── SectionCard ─── */
function SectionCard({ title, onEdit, actions, children }: { title: string; onEdit?: () => void; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 14,
      border: '1px solid #F3F4F6',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid #F9FAFB',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>{title}</span>
        {actions ?? (onEdit ? (
          <button onClick={onEdit} title="Modifier"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', padding: 4, borderRadius: 6,
              fontSize: 14, lineHeight: 1, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF' }}
          >✏️</button>
        ) : null)}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

/* ─── main page ─── */
export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const { accentColor } = useAccentColor()
  const { wsId } = useWorkspace()

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
  const [pendingCityCoords, setPendingCityCoords] = useState<{ lat: number; lng: number } | null>(null)
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
  const [notePhase, setNotePhase] = useState<'input' | 'analyzing' | 'executing' | 'done'>('input')
  const [noteSummary, setNoteSummary] = useState<string[]>([])
  const [noteActionResults, setNoteActionResults] = useState<{ type: string; created: boolean; companyId?: string; contactId?: string; noteId?: string; contactName?: string; accountId?: string | null }[]>([])
  const [conflictChecking, setConflictChecking] = useState(false)
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null)
  const [pendingNote, setPendingNote] = useState<{ content: string; source: 'text' | 'vocal' } | null>(null)
  const forceSaveRef = useRef(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Attachments (pièces jointes dans les notes)
  const [noteFocused, setNoteFocused] = useState(false)
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
  type ChunkUsed = { id: string; content: string; source_type: 'note' | 'document'; source_id: string; title?: string | null; date?: string; author?: string; file_name?: string; file_url?: string; account_id?: string }
  type ConversationTurn = { userMessage: string; aiResponse: string; sources: SearchSource[]; chunksUsed: ChunkUsed[] }
  const [searchQuery, setSearchQuery] = useState('')
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchRecording, setSearchRecording] = useState(false)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)

  // Notification mute
  const [isMuted, setIsMuted] = useState(false)

  // Sort + filter + pagination
  const [contactSort, setContactSort] = useState<'az' | 'za' | 'recent'>('az')
  const [noteSort, setNoteSort] = useState<'recent' | 'oldest' | 'az'>('recent')
  const [notePage, setNotePage] = useState(1)
  const [docSort, setDocSort] = useState<'recent' | 'oldest' | 'az' | 'type'>('recent')
  const [docSearch, setDocSearch] = useState('')
  const [docPage, setDocPage] = useState(1)
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'pdf' | 'docx' | 'xlsx' | 'image'>('all')
  const [initialShareOpen, setInitialShareOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  // Delete account
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  // Access section
  const [portfolioEntry, setPortfolioEntry] = useState<{ id: string; visibility: 'team' | 'private' | 'custom' } | null>(null)
  const [visibility, setVisibility] = useState<'team' | 'private' | 'custom'>('team')
  const [companyMembers, setCompanyMembers] = useState<{ id: string; full_name: string; email: string }[]>([])
  const [accessUserIds, setAccessUserIds] = useState<Set<string>>(new Set())
  const [savingAccess, setSavingAccess] = useState(false)

  /* ─── fetch ─── */
  const fetchAll = useCallback(async () => {
    const supabase = createClient()
    // Account detail shows ALL notes/docs for this account regardless of which workspace
    // they were created in. Filtering by workspace_id here caused notes to disappear
    // when the active workspace differed from the one used at note-creation time.
    // RLS (company_id = get_my_company_id()) already handles data isolation.
    const notesQ = supabase.from('notes').select('*').eq('account_id', id).eq('is_deleted', false).order('created_at', { ascending: false })
    const docsQ = supabase.from('documents').select('*').eq('account_id', id).eq('is_deleted', false).order('created_at', { ascending: false })
    const [
      { data: acc },
      { data: ctcs },
      { data: nts },
      { data: docs },
    ] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('account_id', id).order('is_main_contact', { ascending: false }),
      notesQ,
      docsQ,
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
  }, [id, profile, wsId])

  useEffect(() => { if (!profileLoading) fetchAll() }, [profileLoading, fetchAll])

  /* ─── account info ─── */
  const startEdit = () => {
    setEditData({
      name: account?.name,
      description: account?.description,
      siret: account?.siret,
      address: account?.address,
      city: account?.city,
      postal_code: account?.postal_code,
      phone: account?.phone,
      email: account?.email,
      website: account?.website,
      industry: account?.industry,
      revenue: account?.revenue,
      employees: account?.employees,
      notes_general: account?.notes_general,
      status: account?.status,
    })
    setPendingCityCoords(null)
    setEditing(true)
  }
  const cancelEdit = () => setEditing(false)
  const saveEdit = async () => {
    if (!account) return
    setSaving(true)
    const supabase = createClient()

    // Only send mutable fields — never id, company_id, created_at, last_note_at, created_by
    const EDITABLE: (keyof Account)[] = [
      'name', 'description', 'siret', 'address', 'city', 'postal_code',
      'phone', 'email', 'website', 'industry', 'revenue', 'employees',
      'notes_general', 'status',
    ]
    const payload: Record<string, unknown> = {}
    for (const key of EDITABLE) {
      const val = editData[key]
      if (val !== undefined) payload[key] = val
    }
    if (pendingCityCoords) {
      payload.lat = pendingCityCoords.lat
      payload.lng = pendingCityCoords.lng
    }

    const { data, error } = await supabase.from('accounts').update(payload).eq('id', id).select().single()
    if (!error && data) {
      setAccount(data)
      setEditing(false)
      setPendingCityCoords(null)
    }
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

  /* ─── delete account ─── */
  const handleDeleteAccount = async () => {
    if (!account || deleteConfirmName !== account.name) return
    setDeleting(true)
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
      router.replace('/app/portfolio')
    } catch {
      setDeleting(false)
    }
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

  const handleUpdateContact = (updated: Contact) => {
    setContacts((prev) => prev.map((c) => c.id === updated.id ? updated : c))
    setSelectedContact(updated)
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
    if (!content.trim()) { setNoteError('Le contenu est obligatoire.'); return }
    setNoteError('')

    const finalTitle = noteTitle.trim() ||
      `Note du ${new Date().toLocaleDateString('fr-FR')} — ${account?.name ?? ''}`

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
      title: finalTitle,
      content: content.trim(),
      source,
      is_deleted: false,
      workspace_id: wsId ?? null,
    }).select().single()
    if (error) { setNoteError(error.message) }
    else if (note) {
      setNotes((prev) => [note, ...prev])
      setNoteTitle(''); setNoteText('')
      fetch('/api/index-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: note.id, content: note.content, account_id: id, company_id: profile?.company_id, workspace_id: wsId }),
      }).catch(console.error)
      fetch('/api/notifications/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, noteId: note.id, noteTitle: note.title, accountName: account?.name }),
      }).catch(console.error)
      // Upload pièces jointes
      if (attachments.length > 0) {
        setUploadingAttachments(true)
        const sb = createClient()
        for (const item of attachments) {
          const { file } = item
          const { valid: fileValid } = await validateFile(file)
          if (!fileValid) continue
          const safeName = sanitizeFilename(file.name)
          const filePath = `${profile?.company_id}/${id}/${note.id}/${Date.now()}-${safeName}`
          const { error: storErr } = await sb.storage.from('imports').upload(filePath, file)
          if (storErr) continue
          const isImage = file.type.startsWith('image/')
          const fileType: 'pdf' | 'docx' | 'xlsx' | 'image' = isImage ? 'image'
            : file.type.includes('pdf') ? 'pdf'
            : file.type.includes('wordprocessing') ? 'docx' : 'xlsx'
          const { data: insertedDoc } = await sb.from('documents').insert({
            account_id: id, company_id: profile?.company_id, user_id: profile?.id,
            note_id: note.id, file_name: safeName, file_url: filePath, file_type: fileType,
            title: file.name.replace(/\.[^.]+$/, ''), is_deleted: false, workspace_id: wsId ?? null,
          }).select().single()
          if (!isImage && insertedDoc) {
            fetch('/api/index-document', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ document_id: insertedDoc.id, file_url: filePath, file_type: fileType, account_id: id, company_id: profile?.company_id, workspace_id: wsId }),
            }).catch(console.error)
          }
        }
        setAttachments([])
        setUploadingAttachments(false)
        fetchAll()
      }
    }
    setSavingNote(false)
  }, [noteTitle, account, id, profile, wsId, attachments, fetchAll])

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
    recognitionRef.current?.stop()
    setRecording(false)
    // do not auto-save — let the user click "Enregistrer"
  }, [])

  const processVocalNote = useCallback(async (transcription: string) => {
    if (!transcription.trim() || !profile) return
    setSavingNote(true)
    setNoteError('')
    setNotePhase('analyzing')

    try {
      const processRes = await fetch('/api/notes/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcription, workspaceId: wsId, userId: profile.id, companyId: id }),
      })
      const { actions } = await processRes.json()

      setNotePhase('executing')

      const executeRes = await fetch('/api/notes/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions, workspaceId: wsId, userId: profile.id, companyId: id, source: 'vocal' }),
      })
      const { results: execResults, summary: execSummary } = await executeRes.json()

      // Refresh contacts if any were created for this account
      const newContact = (execResults ?? []).find((r: { type: string; accountId?: string | null; created: boolean }) => r.type === 'create_contact' && r.created && r.accountId === id)
      if (newContact) fetchAll()

      // Refresh notes if any were created for this account
      const newNote = (execResults ?? []).find((r: { type: string; accountId?: string | null; created: boolean }) => r.type === 'create_note' && r.created)
      if (newNote) fetchAll()

      setNoteActionResults(execResults ?? [])
      setNoteSummary(execSummary ?? [])
      setNoteTitle('')
      setNoteText('')
      setNotePhase('done')
      setSavingNote(false)

      setTimeout(() => setNotePhase('input'), 6000)
    } catch {
      setNotePhase('input')
      setSavingNote(false)
    }
  }, [profile, id, wsId, fetchAll])

  const handleDeleteNote = async (noteId: string) => {
    const supabase = createClient()
    await supabase.from('notes').update({ is_deleted: true }).eq('id', noteId)
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  const handleUpdateNote = (updated: Note) => {
    setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n))
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
      const { valid: fileValid } = await validateFile(file)
      if (!fileValid) continue
      const safeName = sanitizeFilename(file.name)
      const filePath = `${profile.company_id}/${Date.now()}-${safeName}`
      const { error: storErr } = await sb.storage.from('documents').upload(filePath, file)
      if (storErr) continue
      const isImage = file.type.startsWith('image/')
      const fileType: 'pdf' | 'docx' | 'xlsx' | 'image' = isImage ? 'image'
        : file.type.includes('pdf') ? 'pdf'
        : file.type.includes('wordprocessing') ? 'docx' : 'xlsx'
      const { data: standaloneDoc } = await sb.from('documents').insert({
        account_id: id, company_id: profile.company_id, user_id: profile.id,
        note_id: null, file_name: safeName, file_url: `documents:${filePath}`,
        file_type: fileType, title: safeName.replace(/\.[^.]+$/, ''), is_deleted: false, workspace_id: wsId ?? null,
      }).select().single()
      if (!isImage && standaloneDoc) {
        fetch('/api/index-document', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: standaloneDoc.id, file_url: `documents:${filePath}`, file_type: fileType, account_id: id, company_id: profile.company_id, workspace_id: wsId }),
        }).catch(console.error)
      }
      fetch('/api/notifications/document', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, documentId: standaloneDoc?.id, fileName: file.name, accountName: account?.name }),
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
    setSearchLoading(true)
    try {
      const lastTurn = conversationHistory[conversationHistory.length - 1] ?? null
      // History: clean user/assistant pairs (no embedded context — server handles that)
      const history = conversationHistory.flatMap((turn) => ([
        { role: 'user' as const, content: turn.userMessage },
        { role: 'assistant' as const, content: turn.aiResponse },
      ]))
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          account_id: id,
          company_id: profile?.company_id,
          workspace_id: wsId,
          history,
          previousChunks: lastTurn?.chunksUsed ?? [],
        }),
      })
      const data = await res.json()
      const newTurn: ConversationTurn = {
        userMessage: query,
        aiResponse: data.answer ?? '',
        sources: data.sources ?? [],
        chunksUsed: data.chunksUsed ?? [],
      }
      setConversationHistory((prev) => [...prev, newTurn])
      setSearchQuery('')
    } catch {
      const errTurn: ConversationTurn = {
        userMessage: query,
        aiResponse: 'Erreur lors de la recherche.',
        sources: [],
        chunksUsed: [],
      }
      setConversationHistory((prev) => [...prev, errTurn])
    }
    setSearchLoading(false)
  }, [searchQuery, conversationHistory, id, profile, wsId])

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

  const speakAnswer = (text: string) => {
    if (!text || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'
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

  const NOTES_PER_PAGE = 5
  const DOCS_PER_PAGE = 5

  const membersMap: Record<string, string> = Object.fromEntries([
    ...(profile ? [[profile.id, profile.full_name]] : []),
    ...companyMembers.map((m) => [m.id, m.full_name]),
  ] as [string, string][])

  const sortedContacts = [...contacts].sort((a, b) => {
    if (contactSort === 'az') return a.last_name.localeCompare(b.last_name)
    if (contactSort === 'za') return b.last_name.localeCompare(a.last_name)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const sortedNotes = [...notes].sort((a, b) => {
    if (noteSort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (noteSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return (a.title ?? '').localeCompare(b.title ?? '')
  })
  const notesTotalPages = Math.max(1, Math.ceil(sortedNotes.length / NOTES_PER_PAGE))
  const pagedNotes = sortedNotes.slice((notePage - 1) * NOTES_PER_PAGE, notePage * NOTES_PER_PAGE)

  const filteredDocs = documents.filter((doc) => {
    const matchSearch = !docSearch || (doc.title ?? doc.file_name).toLowerCase().includes(docSearch.toLowerCase())
    const matchType = docTypeFilter === 'all' || doc.file_type === docTypeFilter
    return matchSearch && matchType
  }).sort((a, b) => {
    if (docSort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (docSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (docSort === 'az') return (a.title ?? a.file_name).localeCompare(b.title ?? b.file_name)
    return a.file_type.localeCompare(b.file_type)
  })
  const docsTotalPages = Math.max(1, Math.ceil(filteredDocs.length / DOCS_PER_PAGE))
  const pagedDocs = filteredDocs.slice((docPage - 1) * DOCS_PER_PAGE, docPage * DOCS_PER_PAGE)

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
      <div className="hidden lg:block px-6 pt-4 pb-0">
        <Breadcrumb items={[
          { label: 'MAIMOO', href: '/app/dashboard' },
          { label: 'Mon portefeuille', href: '/app/portfolio' },
          { label: account.name },
        ]} />
      </div>

      {/* ─── Mobile header ─── */}
      <div className="lg:hidden bg-white sticky top-0 z-30" style={{ borderBottom: '1px solid #F3F4F6' }}>
        {/* Row 1 — right actions (back button is fixed below, overlaying the burger slot) */}
        <div className="flex items-center justify-end px-3 pt-2 pb-1 gap-0.5 min-h-[52px]">
          <button
            onClick={handleToggleMute}
            className="w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-gray-50"
            title={isMuted ? 'Réactiver les notifications' : 'Désactiver les notifications'}
          >
            {isMuted
              ? <BellOff className="w-[18px] h-[18px] text-[#94A3B8]" />
              : <Bell className="w-[18px] h-[18px] text-[#0A0A0A]" />}
          </button>
          {(profile?.role === 'admin' || portfolioEntry !== null) && (
            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen((v) => !v)}
                className="w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-gray-50"
              >
                <MoreVertical className="w-[18px] h-[18px] text-[#0A0A0A]" />
              </button>
              {moreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden min-w-[180px]">
                    <button
                      onClick={() => { setMoreMenuOpen(false); setDeleteConfirmName(''); setDeleteModalOpen(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-[#EF4444] hover:bg-red-50 transition-colors text-left"
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />Supprimer la fiche
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* Row 2 — centered avatar + name + status */}
        <div className="flex flex-col items-center gap-2 pb-5 px-8">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: '#2563EB' }}
          >
            {getInitials(account.name)}
          </div>
          <h1
            className="text-[20px] font-bold text-[#0A0A0A] text-center leading-tight"
            style={{ wordBreak: 'break-word', maxWidth: 280 }}
          >
            {account.name}
          </h1>
          <button
            onClick={handleStatusToggle}
            className="px-3 py-1 rounded-full text-[12px] font-medium transition-all"
            style={{
              background: account.status === 'client' ? '#DCFCE7' : '#EFF6FF',
              color: account.status === 'client' ? '#16A34A' : '#2563EB',
            }}
          >
            {account.status === 'client' ? 'Client' : 'Prospect'}
          </button>
        </div>
      </div>

      {/* Back button — fixed, overlays the mobile burger button slot */}
      <button
        onClick={() => router.back()}
        className="lg:hidden fixed top-3 left-3 z-[51] w-10 h-10 flex items-center justify-center rounded-xl"
        style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
      >
        <ArrowLeft className="w-5 h-5 text-[#0A0A0A]" />
      </button>

      {/* ─── Desktop header ─── */}
      <div className="hidden lg:flex bg-white sticky top-0 z-30 items-center gap-3"
        style={{ borderBottom: '1px solid #F3F4F6', padding: '0 24px', height: 60 }}>
        <button onClick={() => router.back()}
          className="p-2 rounded-xl text-slate-400 hover:bg-[#F5F5F5] transition-all shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#EFF6FF', color: '#2563EB',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {getInitials(account.name)}
        </div>
        {/* Name + badge + city */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0A0A0A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.name}
            </h1>
            <button onClick={handleStatusToggle} style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: account.status === 'client' ? '#DCFCE7' : '#EFF6FF',
              color: account.status === 'client' ? '#16A34A' : '#2563EB', flexShrink: 0,
            }}>
              {account.status === 'client' ? 'Client' : 'Prospect'}
            </button>
            {account.city && (
              <span style={{ fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>· {account.city}</span>
            )}
          </div>
        </div>
        {/* ··· menu */}
        <div className="relative">
          <button
            onClick={() => setMoreMenuOpen((v) => !v)}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E5E7EB', background: '#ffffff',
              cursor: 'pointer', color: '#6B7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, letterSpacing: 2,
            }}
          >···</button>
          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMoreMenuOpen(false)} />
              <div className="absolute right-0 z-40" style={{
                top: 40, background: '#ffffff', borderRadius: 12,
                border: '1px solid #E5E7EB', boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                minWidth: 200, overflow: 'hidden',
              }}>
                <button onClick={() => { setMoreMenuOpen(false); handleToggleMute() }} style={{
                  width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                  textAlign: 'left', fontSize: 14, color: '#374151', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {isMuted ? <BellOff className="w-4 h-4 shrink-0" /> : <Bell className="w-4 h-4 shrink-0" />}
                  {isMuted ? 'Réactiver les notifs' : 'Désactiver les notifs'}
                </button>
                {(profile?.role === 'admin' || portfolioEntry !== null) && (
                  <>
                    <div style={{ height: 1, background: '#F3F4F6', margin: '0 12px' }} />
                    <button onClick={() => { setMoreMenuOpen(false); setDeleteConfirmName(''); setDeleteModalOpen(true) }} style={{
                      width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                      textAlign: 'left', fontSize: 14, color: '#DC2626', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <Trash2 className="w-4 h-4 shrink-0" /> Supprimer la fiche
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="lg:hidden flex gap-2 px-3 py-3 bg-white" style={{ borderBottom: '1px solid #F3F4F6' }}>
        {([
          { value: 'info', label: 'Info' },
          { value: 'notes', label: 'Notes' },
          { value: 'search', label: 'IA' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setMobileTab(value); if (value !== 'info') setTab(value as Tab) }}
            className="py-2 px-5 rounded-full text-[14px] font-medium transition-all duration-200 whitespace-nowrap"
            style={mobileTab === value
              ? { background: '#0A0A0A', color: '#fff' }
              : { background: '#F3F4F6', color: '#6B7280' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">

        {/* ── LEFT COLUMN ── */}
        <div className={`border-b lg:border-b-0 lg:border-r border-slate-100 overflow-auto px-4 pt-5 pb-24 lg:p-6 lg:pb-6 space-y-6 ${mobileTab !== 'info' ? 'hidden lg:block' : ''}`}>

          {/* Account Info */}
          <SectionCard
            title="Informations"
            onEdit={editing ? undefined : startEdit}
            actions={editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                <Button size="sm" loading={saving} onClick={saveEdit}><Save className="w-4 h-4 mr-1" />Sauvegarder</Button>
              </div>
            ) : undefined}
          >
            <div>
              {infoFields.map(({ key, label, placeholder }) => (
                editing ? (
                  key === 'city' ? (
                    <CityInput
                      key={key}
                      label={label}
                      placeholder={placeholder}
                      value={(editData[key] as string) ?? ''}
                      onChange={(city, lat, lng) => {
                        setEditData((prev) => ({ ...prev, city: city || null }))
                        setPendingCityCoords(lat !== undefined && lng !== undefined ? { lat, lng } : null)
                      }}
                    />
                  ) : (
                    <Input key={key} label={label} placeholder={placeholder}
                      value={(editData[key] as string) ?? ''}
                      onChange={(e) => setEditData((prev) => ({ ...prev, [key]: e.target.value || null }))} />
                  )
                ) : (account[key] ? (
                  <div key={key} className="py-3 border-b border-[#F3F4F6] last:border-b-0">
                    <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.05em] text-[#9CA3AF] mb-1">{label}</p>
                    {key === 'email'
                      ? <a href={`mailto:${account[key] as string}`} className="text-[15px] md:text-sm text-[#2563EB] hover:underline">{account[key] as string}</a>
                      : key === 'phone'
                      ? <a href={`tel:${(account[key] as string).replace(/\s/g, '')}`} className="text-[15px] md:text-sm text-[#0A0A0A] transition-colors">{account[key] as string}</a>
                      : key === 'website'
                      ? <a href={(account[key] as string).startsWith('http') ? account[key] as string : `https://${account[key] as string}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[15px] md:text-sm text-[#0A0A0A] hover:underline">{account[key] as string}<ExternalLink className="w-3 h-3 shrink-0 ml-0.5" /></a>
                      : <p className="text-[15px] md:text-sm text-[#0A0A0A] md:text-[#1E293B]">{account[key] as string}</p>
                    }
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
                <div className="py-3 border-b border-[#F3F4F6]">
                  <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.05em] text-[#9CA3AF] mb-1">Notes générales</p>
                  <p className="text-[15px] md:text-sm text-[#0A0A0A] md:text-[#1E293B] whitespace-pre-wrap">{account.notes_general}</p>
                </div>
              ) : null}
            </div>
          </SectionCard>

          {/* Contacts */}
          <SectionCard
            title="Interlocuteurs"
            actions={
              <div className="flex items-center gap-2">
                <select value={contactSort} onChange={(e) => setContactSort(e.target.value as 'az' | 'za' | 'recent')} className="hidden lg:block text-[11px] text-[#6B6B6B] bg-transparent border-none focus:outline-none cursor-pointer">
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                  <option value="recent">Date d&apos;ajout</option>
                </select>
                <button
                  onClick={() => setContactModal(true)}
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium text-white transition-colors"
                  style={{ background: '#2563EB' }}
                >
                  <Plus className="w-3 h-3" />Ajouter
                </button>
              </div>
            }
          >
            {contacts.length === 0 ? (
              <p className="text-sm text-[#64748B]">Aucun interlocuteur.</p>
            ) : (
              <div className="space-y-2">
                {sortedContacts.map((c) => (
                  <div key={c.id}
                    className="bg-white rounded-[12px] border border-gray-100 p-[14px] md:p-3 cursor-pointer hover:border-[#E5E5E5] hover:bg-[#F8FAFF] transition-all duration-150 mb-2 last:mb-0"
                    onClick={() => setSelectedContact(c)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 md:w-8 md:h-8 rounded-full md:rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F3F4F6' }}>
                          <span className="text-xs font-bold" style={{ color: '#6B7280' }}>{getInitials(`${c.first_name} ${c.last_name}`)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[15px] md:text-sm font-semibold text-[#0A0A0A] md:text-[#1E293B]">{c.first_name} {c.last_name}</p>
                            {c.is_main_contact && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[11px] md:text-xs font-medium rounded-lg">
                                <Star className="w-2.5 h-2.5" />Principal
                              </span>
                            )}
                          </div>
                          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="text-[13px] md:text-xs text-[#64748B] hover:text-[#0A0A0A] transition-colors block mt-0.5">{c.phone}</a>}
                          {c.email && <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="text-[13px] md:text-xs text-[#2563EB] hover:underline block mt-0.5">{c.email}</a>}
                          {c.role && <p className="text-[12px] md:text-xs text-[#9CA3AF] md:text-slate-500 italic mt-0.5">{c.role}</p>}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteContact(c.id) }}
                        className="w-11 h-11 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150 shrink-0 -mr-2 -mt-1"
                      >
                        <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                      </button>
                    </div>
                    {c.notes && <p className="text-[13px] md:text-xs text-[#64748B] mt-2 pt-2 border-t border-gray-100">{c.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Documents */}
          <SectionCard
            title={`Documents (${documents.length})`}
            actions={
              <div className="flex items-center gap-2">
                <select value={docSort} onChange={(e) => setDocSort(e.target.value as 'recent' | 'oldest' | 'az' | 'type')} className="hidden lg:block text-[11px] text-[#6B6B6B] bg-transparent border-none focus:outline-none cursor-pointer">
                  <option value="recent">Date (récent)</option>
                  <option value="oldest">Date (ancien)</option>
                  <option value="az">A → Z</option>
                  <option value="type">Type</option>
                </select>
                <label
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-all duration-150 text-white"
                  style={{ background: '#2563EB' }}
                >
                  {docUploading
                    ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><Upload className="w-3 h-3 mr-0.5" />Ajouter</>
                  }
                  <input type="file" multiple className="hidden" onChange={handleStandaloneDocUpload} disabled={docUploading} />
                </label>
              </div>
            }
          >
            {/* Search bar */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8] pointer-events-none" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => { setDocSearch(e.target.value); setDocPage(1) }}
                placeholder="Rechercher un document..."
                className="w-full pl-8 pr-8 py-2.5 rounded-xl text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none"
                style={{ background: '#F5F7FA', border: '1px solid #E5EAF5', borderRadius: 10 }}
              />
              {docSearch && (
                <button onClick={() => { setDocSearch(''); setDocPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Type filter pills */}
            <div className="flex gap-2 flex-wrap mb-3">
              {(['all', 'pdf', 'docx', 'xlsx', 'image'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setDocTypeFilter(t); setDocPage(1) }}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150"
                  style={docTypeFilter === t
                    ? { background: '#0A0A0A', color: 'white' }
                    : { background: '#F5F5F5', color: '#6B6B6B' }
                  }
                >
                  {t === 'all' ? 'Tous' : t === 'pdf' ? 'PDF' : t === 'docx' ? 'Word' : t === 'xlsx' ? 'Excel' : 'Images'}
                </button>
              ))}
            </div>

            {/* Document list */}
            {filteredDocs.length === 0 ? (
              <p className="text-sm text-[#64748B]">{documents.length === 0 ? 'Aucun document.' : 'Aucun résultat.'}</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {pagedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-1 rounded-xl transition-all duration-150 hover:bg-gray-50 group"
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
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <p className="text-[10px] text-[#94A3B8]">{fmtDay(doc.created_at)}</p>
                            {doc.user_id && membersMap[doc.user_id] && (
                              <p className="text-[10px] text-[#94A3B8]">· {membersMap[doc.user_id].split(' ')[0]}</p>
                            )}
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${doc.note_id ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-[#94A3B8]'}`}>
                              {doc.note_id ? 'Lié' : 'Seul'}
                            </span>
                          </div>
                        </div>
                      </button>
                      {/* Actions */}
                      <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                        <button
                          onClick={() => { setInitialShareOpen(true); handleOpenDocument(doc) }}
                          className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#0A0A0A] hover:bg-[#F5F5F5] transition-all duration-150"
                          title="Partager"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteDocId === doc.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { handleDeleteDocument(doc.id); setConfirmDeleteDocId(null) }} className="px-2 py-1 text-[10px] font-medium text-white bg-red-500 rounded-lg hover:bg-red-600">Sup.</button>
                            <button onClick={() => setConfirmDeleteDocId(null)} className="px-2 py-1 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteDocId(doc.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination docs */}
                {docsTotalPages > 1 && (
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button
                      onClick={() => setDocPage((p) => Math.max(1, p - 1))}
                      disabled={docPage === 1}
                      className="p-0.5 rounded text-[#6B6B6B] disabled:opacity-30 hover:text-[#0A0A0A] transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-[#6B6B6B]">Page {docPage} / {docsTotalPages}</span>
                    <button
                      onClick={() => setDocPage((p) => Math.min(docsTotalPages, p + 1))}
                      disabled={docPage === docsTotalPages}
                      className="p-0.5 rounded text-[#6B6B6B] disabled:opacity-30 hover:text-[#0A0A0A] transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* Access */}
          {portfolioEntry && (
            <SectionCard title="Accès">
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
                        ? 'border-[#0A0A0A] bg-[#0A0A0A]/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${visibility === value ? 'text-[#0A0A0A]' : 'text-[#64748B]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${visibility === value ? 'text-[#0A0A0A]' : 'text-[#1E293B]'}`}>{label}</p>
                      <p className="text-xs text-[#64748B]">{desc}</p>
                    </div>
                    {visibility === value && <div className="w-2 h-2 rounded-full bg-[#0A0A0A] shrink-0" />}
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
            </SectionCard>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className={`flex flex-col min-h-0 ${mobileTab === 'info' ? 'hidden lg:flex' : ''}`}>
          {/* Desktop tabs */}
          <div className="hidden lg:flex gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-white">
            {([
              { value: 'notes' as Tab, label: 'Notes', icon: FileText },
              { value: 'search' as Tab, label: 'IA', icon: Search },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${tab === value ? 'bg-[#0A0A0A] text-white' : 'text-[#64748B] bg-[#F5F5F5]'}`}
              >
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4 pb-24 lg:p-6 lg:pb-6 space-y-4">

            {/* ── NOTES TAB ── */}
            {tab === 'notes' && (
              <>
                {/* Note input */}
                <div
                  onFocusCapture={() => setNoteFocused(true)}
                  onBlurCapture={() => setNoteFocused(false)}
                  style={{
                    background: '#ffffff', borderRadius: 14, overflow: 'hidden',
                    border: noteFocused ? '1.5px solid #2563EB' : '1.5px solid #E5E7EB',
                    boxShadow: noteFocused ? '0 0 0 3px rgba(37,99,235,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                >
                  {/* Underline tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingLeft: 4 }}>
                    {(['text', 'vocal'] as const).map((m) => (
                      <button key={m} onClick={() => setNoteMode(m)} style={{
                        padding: '10px 14px', fontSize: 13, fontWeight: 500,
                        color: noteMode === m ? '#2563EB' : '#9CA3AF',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: noteMode === m ? '2px solid #2563EB' : '2px solid transparent',
                        marginBottom: -1,
                        display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'color 0.15s',
                      }}>
                        {m === 'text' ? <><Type style={{ width: 13, height: 13 }} />Texte</> : <><Mic style={{ width: 13, height: 13 }} />Vocal</>}
                      </button>
                    ))}
                  </div>

                  {/* Content */}
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Input placeholder="Titre (optionnel — généré automatiquement si vide)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
                    {noteMode === 'text' ? (
                      <form id="account-note-form" onSubmit={(e) => { e.preventDefault(); saveNote(noteText, 'text') }}>
                        <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Contenu de la note..." rows={3}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent" />
                        {noteError && <FormMessage type="error" message={noteError} />}
                        {conflictChecking && (
                          <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-2">
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Analyse en cours…
                          </p>
                        )}
                        {conflictResult && (
                          <div className="rounded-xl border px-4 py-3 space-y-2 mt-2" style={{ background: '#FEF9C3', borderColor: '#EAB308' }}>
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
                        {noteError && <FormMessage type="error" message={noteError} />}
                        {notePhase === 'done' && noteSummary.length > 0 && (
                          <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: 'rgba(34,197,94,0.08)' }}>
                            {noteActionResults.map((r, i) => (
                              <p key={i} className="text-xs font-medium" style={{ color: '#065F46' }}>{noteSummary[i] ?? ''}</p>
                            ))}
                          </div>
                        )}
                        {(notePhase === 'analyzing' || notePhase === 'executing') && (
                          <div className="flex items-center gap-2 py-1">
                            <span className="w-4 h-4 border-2 border-[#0A0A0A] border-t-transparent rounded-full animate-spin shrink-0" />
                            <span className="text-xs text-[#64748B]">{notePhase === 'analyzing' ? 'Analyse en cours…' : 'Exécution des actions…'}</span>
                          </div>
                        )}
                        {notePhase === 'input' && !recording ? (
                          <button onClick={startRecording} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-500 font-medium text-sm hover:bg-red-100 transition-all duration-150">
                            <Mic className="w-5 h-5" />Démarrer l&apos;enregistrement
                          </button>
                        ) : notePhase === 'input' && recording ? (
                          <button onClick={stopRecording} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 animate-pulse">
                            <MicOff className="w-5 h-5" />Arrêter l&apos;enregistrement
                          </button>
                        ) : null}
                      </div>
                    )}
                    {/* Attachment previews */}
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

                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 10px', borderTop: '1px solid #F3F4F6' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#6B7280', background: '#F9FAFB', cursor: 'pointer' }}>
                      <Paperclip style={{ width: 13, height: 13 }} />Fichier
                      <input type="file" multiple className="hidden" onChange={handleAddAttachments} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#6B7280', background: '#F9FAFB', cursor: 'pointer' }}>
                      <Camera style={{ width: 13, height: 13 }} />Photo
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAddAttachments} />
                    </label>
                    {uploadingAttachments && (
                      <span className="flex items-center gap-1 text-xs text-[#64748B]">
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />Upload…
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {noteMode === 'text' && !conflictResult && (
                      <button
                        form="account-note-form"
                        type="submit"
                        disabled={savingNote || conflictChecking || !noteText.trim()}
                        style={{
                          background: noteText.trim() && !savingNote && !conflictChecking ? '#2563EB' : '#E5E7EB',
                          color: noteText.trim() && !savingNote && !conflictChecking ? '#fff' : '#9CA3AF',
                          border: 'none', borderRadius: 8,
                          padding: '6px 14px', fontSize: 12, fontWeight: 600,
                          cursor: noteText.trim() && !savingNote && !conflictChecking ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'background 0.15s',
                        }}
                      >
                        {(savingNote || conflictChecking)
                          ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Send style={{ width: 12, height: 12 }} />
                        }
                        Enregistrer
                      </button>
                    )}
                    {noteMode === 'vocal' && noteText.trim() && !recording && notePhase === 'input' && (
                      <button
                        onClick={() => processVocalNote(noteText)}
                        disabled={savingNote}
                        style={{
                          background: savingNote ? '#E5E7EB' : '#2563EB',
                          color: savingNote ? '#9CA3AF' : '#fff',
                          border: 'none', borderRadius: 8,
                          padding: '6px 14px', fontSize: 12, fontWeight: 600,
                          cursor: savingNote ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {savingNote
                          ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Save style={{ width: 12, height: 12 }} />
                        }
                        Enregistrer
                      </button>
                    )}
                  </div>
                </div>

                {/* Notes list */}
                {notes.length === 0 ? (
                  <div className="text-center py-8"><FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" /><p className="text-sm text-[#64748B]">Aucune note</p></div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-[#94A3B8]">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
                      <select value={noteSort} onChange={(e) => { setNoteSort(e.target.value as 'recent' | 'oldest' | 'az'); setNotePage(1) }} className="text-[11px] text-[#6B6B6B] bg-transparent border-none focus:outline-none cursor-pointer">
                        <option value="recent">Date (récent)</option>
                        <option value="oldest">Date (ancien)</option>
                        <option value="az">A → Z</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      {pagedNotes.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          noteDocuments={documents.filter(d => d.note_id === note.id && !d.is_deleted)}
                          accountId={id}
                          companyId={profile?.company_id ?? null}
                          workspaceId={wsId ?? null}
                          companyName={account.name}
                          membersMap={membersMap}
                          onDelete={handleDeleteNote}
                          onUpdate={handleUpdateNote}
                          onOpenDoc={handleOpenDocument}
                        />
                      ))}
                    </div>
                    {notesTotalPages > 1 && (
                      <div className="flex items-center justify-end gap-2 mt-3">
                        <button
                          onClick={() => setNotePage((p) => Math.max(1, p - 1))}
                          disabled={notePage === 1}
                          className="p-0.5 rounded text-[#6B6B6B] disabled:opacity-30 hover:text-[#0A0A0A] transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] text-[#6B6B6B]">Page {notePage} / {notesTotalPages}</span>
                        <button
                          onClick={() => setNotePage((p) => Math.min(notesTotalPages, p + 1))}
                          disabled={notePage === notesTotalPages}
                          className="p-0.5 rounded text-[#6B6B6B] disabled:opacity-30 hover:text-[#0A0A0A] transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── AI SEARCH TAB ── */}
            {tab === 'search' && (
              <>
                {/* Input */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder={conversationHistory.length > 0 ? 'Posez une question de suivi…' : 'Posez une question sur ce client…'}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent" />
                    <button onClick={searchRecording ? () => setSearchRecording(false) : startSearchRecording}
                      className={`p-2.5 rounded-xl transition-all duration-150 ${searchRecording ? 'bg-red-500 text-white animate-pulse' : 'border border-gray-200 text-[#64748B] hover:bg-gray-50'}`}>
                      {searchRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSearch()} loading={searchLoading} disabled={!searchQuery.trim()} className="flex-1">
                      <Search className="w-4 h-4 mr-2" />Rechercher
                    </Button>
                    {conversationHistory.length > 0 && (
                      <button
                        onClick={() => { setConversationHistory([]); setExpandedSource(null) }}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-[#94A3B8] border border-gray-200 hover:bg-gray-50 transition-all"
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                </div>

                {/* Conversation history */}
                {conversationHistory.length > 0 && (
                  <div className="space-y-4">
                    {conversationHistory.map((turn, i) => (
                      <div key={i} className="space-y-2">
                        {/* User message */}
                        <div className="flex justify-end">
                          <div className="max-w-[85%] bg-[#0A0A0A]/8 rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-[#1E293B]">
                            {turn.userMessage}
                          </div>
                        </div>
                        {/* AI answer */}
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">IA</span>
                            <button onClick={() => speakAnswer(turn.aiResponse)} className="p-1 rounded-lg text-[#94A3B8] hover:text-[#64748B] hover:bg-gray-100 transition-all">
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{turn.aiResponse}</p>
                          {turn.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <div className="flex flex-wrap gap-1.5">
                                {turn.sources.map((src) => (
                                  <button key={src.id}
                                    onClick={() => {
                                      if (src.type === 'document' && src.url) window.open(src.url, '_blank')
                                      else setExpandedSource(expandedSource === src.id ? null : src.id)
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0A0A0A]/5 text-xs font-medium text-[#0A0A0A] hover:bg-[#0A0A0A]/10 transition-all duration-150"
                                  >
                                    {src.type === 'document' ? <ExternalLink className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                                    <span className="truncate max-w-[120px]">{src.title}</span>
                                    {src.date && <span className="text-[#94A3B8] shrink-0">· {fmtDay(src.date)}</span>}
                                  </button>
                                ))}
                              </div>
                              {expandedSource && (() => {
                                const src = turn.sources.find((s) => s.id === expandedSource)
                                return src ? (
                                  <div className="mt-2 p-3 bg-gray-50 rounded-xl">
                                    <p className="text-xs font-medium text-[#1E293B] mb-0.5">{src.title}</p>
                                    {src.author && <p className="text-xs text-[#64748B]">Par {src.author}{src.date ? ` · ${fmtDay(src.date)}` : ''}</p>}
                                  </div>
                                ) : null
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Loading indicator */}
                {searchLoading && (
                  <div className="flex items-center gap-2 py-4 pl-1">
                    <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Contact panel */}
      {selectedContact && (
        <ContactPanel
          contact={selectedContact}
          notes={notes}
          onClose={() => setSelectedContact(null)}
          onUpdate={handleUpdateContact}
          onDelete={(cid) => { handleDeleteContact(cid); setSelectedContact(null) }}
        />
      )}

      {/* Contact modal */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Ajouter un interlocuteur">
        <form onSubmit={handleAddContact} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prénom" placeholder="Jean" value={contactForm.first_name} onChange={(e) => setContactForm((p) => ({ ...p, first_name: e.target.value }))} autoFocus />
            <Input label="Nom" placeholder="Dupont" value={contactForm.last_name} onChange={(e) => setContactForm((p) => ({ ...p, last_name: e.target.value }))} />
          </div>
          <Input label="Rôle" placeholder="Acheteur, Dirigeant..." value={contactForm.role} onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))} />
          <Input label="Téléphone" placeholder="06 ..." value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} />
          <Input label="Email" type="email" placeholder="jean@..." value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} onInvalid={(e) => e.preventDefault()} />
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
          initialShareOpen={initialShareOpen}
          onClose={() => { setPreviewDoc(null); setPreviewUrl(null); setInitialShareOpen(false) }}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal open={deleteModalOpen} onClose={() => !deleting && setDeleteModalOpen(false)} title={`Supprimer ${account.name} ?`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 leading-relaxed">
              Cette action est <strong>irréversible</strong>. Toutes les notes, documents et contacts associés seront également supprimés.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#1E293B]">
              Tapez <span className="font-bold text-[#EF4444]">{account.name}</span> pour confirmer
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={account.name}
              autoFocus
              className="w-full px-3 rounded-xl border border-gray-200 text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              style={{ fontSize: 16, minHeight: 48 }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-[#64748B] hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmName !== account.name || deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: '#EF4444' }}
            >
              {deleting
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Trash2 className="w-4 h-4" />
              }
              Supprimer définitivement
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ─── ContactPanel ─── */
function ContactPanel({ contact, notes, onClose, onUpdate, onDelete }: {
  contact: Contact
  notes: Note[]
  onClose: () => void
  onUpdate: (c: Contact) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name,
    role: contact.role ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    notes: contact.notes ?? '',
    is_main_contact: contact.is_main_contact,
  })
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  const initials = getInitials(`${contact.first_name} ${contact.last_name}`)
  const relatedNotes = notes.filter((n) =>
    n.content?.toLowerCase().includes(contact.first_name.toLowerCase()) ||
    n.content?.toLowerCase().includes(contact.last_name.toLowerCase())
  ).slice(0, 3)

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('contacts').update({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      role: form.role || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      is_main_contact: form.is_main_contact,
    }).eq('id', contact.id).select().single()
    if (!error && data) { onUpdate(data); setEditing(false) }
    setSaving(false)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(1px)' }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full z-50 bg-white flex flex-col"
        style={{
          width: 'min(380px, 100vw)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          transform: mounted ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <h3 className="text-sm font-semibold text-[#1E293B]">Fiche contact</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ background: '#0A0A0A' }}>
              {initials}
            </div>
            <div className="text-center">
              <p className="font-semibold text-[#1E293B]">{contact.first_name} {contact.last_name}</p>
              {contact.role && <p className="text-xs text-[#64748B] mt-0.5">{contact.role}</p>}
              {contact.is_main_contact && (
                <span className="inline-flex items-center gap-0.5 mt-1.5 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-medium rounded-lg">
                  <Star className="w-2.5 h-2.5" />Contact principal
                </span>
              )}
            </div>
          </div>

          {!editing ? (
            <div className="space-y-2">
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5F5F5] hover:bg-[#E8EEFF] transition-all"
                >
                  <Phone className="w-4 h-4 shrink-0" style={{ color: '#0A0A0A' }} />
                  <span className="text-sm text-[#1E293B]">{contact.phone}</span>
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5F5F5] hover:bg-[#E8EEFF] transition-all"
                >
                  <Mail className="w-4 h-4 shrink-0" style={{ color: '#0A0A0A' }} />
                  <span className="text-sm text-[#1E293B]">{contact.email}</span>
                </a>
              )}
              {!contact.phone && !contact.email && (
                <p className="text-sm text-[#94A3B8] text-center py-2">Aucune coordonnée renseignée</p>
              )}
              {contact.notes && (
                <div className="px-3 py-2.5 rounded-xl bg-[#F5F5F5]">
                  <p className="text-xs text-[#94A3B8] mb-1">Notes</p>
                  <p className="text-sm text-[#1E293B]">{contact.notes}</p>
                </div>
              )}
              <button
                onClick={() => setEditing(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all hover:bg-[#F5F5F5]"
                style={{ border: '1.5px dashed #E5E5E5', color: '#0A0A0A' }}
              >
                <Edit2 className="w-3.5 h-3.5" />Modifier les informations
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input label="Prénom" value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} />
                <Input label="Nom" value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
              </div>
              <Input label="Rôle" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} />
              <Input label="Téléphone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              <Input label="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              <div>
                <label className="text-sm font-medium text-[#1E293B] block mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#0A0A0A] focus:border-transparent"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_main_contact}
                  onChange={(e) => setForm((p) => ({ ...p, is_main_contact: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm text-[#1E293B]">Contact principal</span>
              </label>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setEditing(false)}>Annuler</Button>
                <Button size="sm" className="flex-1" loading={saving} onClick={handleSave}>Sauvegarder</Button>
              </div>
            </div>
          )}

          {relatedNotes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Notes liées</p>
              <div className="space-y-2">
                {relatedNotes.map((n) => (
                  <div key={n.id} className="px-3 py-2.5 rounded-xl bg-[#F5F5F5]">
                    {n.title && <p className="text-xs font-semibold text-[#1E293B] mb-1">{n.title}</p>}
                    <p className="text-xs text-[#64748B] line-clamp-2">{n.content}</p>
                    <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>{fmtDay(n.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <button
            onClick={() => { onDelete(contact.id); onClose() }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 className="w-4 h-4" />Supprimer ce contact
          </button>
        </div>
      </div>
    </>
  )
}

/* ─── DocPreviewModal ─── */
function DocPreviewModal({ doc, url, onClose, initialShareOpen = false }: { doc: Document; url: string; onClose: () => void; initialShareOpen?: boolean }) {
  const { profile } = useUser()
  const [isMobile, setIsMobile] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (initialShareOpen) setShareOpen(true)
  }, [initialShareOpen])
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
      {/* Image lightbox — full screen dark */}
      {isImage ? (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.95)' }}
          onClick={onClose}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={doc.title ?? doc.file_name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', touchAction: 'manipulation' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-lg"
            style={{ zIndex: 10000 }}
          >
            <X className="w-4 h-4 text-[#1E293B]" />
          </button>
        </div>
      ) : (
        /* PDF / Office / Other — bottom-sheet on mobile, centered modal on desktop */
        <div
          className={`fixed inset-0 flex ${isMobile ? 'items-end' : 'items-center justify-center'}`}
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)' }}
          onClick={onClose}
        >
          <div
            className={`relative flex flex-col overflow-hidden ${
              isMobile
                ? 'w-full rounded-t-[20px]'
                : 'w-[80vw] h-[85vh] rounded-2xl'
            }`}
            style={{ background: '#fff', height: isMobile ? '70vh' : undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile only) */}
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
            )}

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
                  Ouvrir dans le navigateur
                </button>
              </div>
            )}

            {/* Unsupported type */}
            {!isPdf && !isOffice && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
                <FileText className="w-12 h-12 text-[#CBD5E1]" />
                <p className="text-sm font-medium text-[#1E293B] text-center">{doc.title ?? doc.file_name}</p>
                <p className="text-xs text-[#94A3B8] text-center">
                  Ce type de fichier ne peut pas être prévisualisé directement.
                </p>
                <button
                  onClick={() => window.open(url, '_blank')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all duration-150"
                  style={{ background: '#3B82F6' }}
                >
                  <ExternalLink className="w-4 h-4" />
                  Ouvrir dans le navigateur
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Type, Trash2, Pencil, X, Save, Paperclip, FileText, ImageIcon, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import type { Note, Document } from '@/types/database'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

type AttachItem = { id: string; file: File; preview?: string }

interface NoteCardProps {
  note: Note
  noteDocuments?: Document[]
  accountId?: string
  companyId?: string | null
  workspaceId?: string | null
  membersMap?: Record<string, string>
  onDelete: (id: string) => void
  onUpdate?: (updated: Note) => void
  onOpenDoc?: (doc: Document) => void
}

export function NoteCard({
  note, noteDocuments = [], accountId, companyId, workspaceId,
  membersMap = {}, onDelete, onUpdate, onOpenDoc,
}: NoteCardProps) {
  const { profile } = useUser()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title ?? '')
  const [editContent, setEditContent] = useState(note.content)
  const [newAttachments, setNewAttachments] = useState<AttachItem[]>([])
  const [removedDocIds, setRemovedDocIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [editing, editContent])

  const startEdit = () => {
    setEditTitle(note.title ?? '')
    setEditContent(note.content)
    setNewAttachments([])
    setRemovedDocIds(new Set())
    setEditing(true)
    setConfirming(false)
  }

  const cancelEdit = () => {
    setEditing(false)
    setNewAttachments([])
    setRemovedDocIds(new Set())
  }

  const handleAddFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => {
      const itemId = `${Date.now()}-${Math.random()}`
      setNewAttachments((prev) => [...prev, { id: itemId, file }])
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const preview = ev.target?.result as string
          setNewAttachments((prev) => prev.map((a) => a.id === itemId ? { ...a, preview } : a))
        }
        reader.readAsDataURL(file)
      }
    })
    e.target.value = ''
  }, [])

  const handleSave = async () => {
    if (!editContent.trim()) return
    setSaving(true)
    const supabase = createClient()

    // 1. Update note record
    const { data: updatedNote, error } = await supabase
      .from('notes')
      .update({
        title: editTitle.trim() || null,
        content: editContent.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', note.id)
      .select()
      .single()

    if (error || !updatedNote) { setSaving(false); return }

    // 2. Soft-delete removed documents
    for (const docId of removedDocIds) {
      await supabase.from('documents').update({ is_deleted: true }).eq('id', docId)
    }

    // 3. Upload new attachments
    if (newAttachments.length > 0 && profile && accountId) {
      for (const item of newAttachments) {
        const filePath = `${profile.company_id}/${accountId}/${note.id}/${Date.now()}-${item.file.name}`
        const { error: storErr } = await supabase.storage.from('imports').upload(filePath, item.file)
        if (storErr) continue
        const isImage = item.file.type.startsWith('image/')
        const fileType: 'pdf' | 'docx' | 'xlsx' | 'image' = isImage ? 'image'
          : item.file.type.includes('pdf') ? 'pdf'
          : item.file.type.includes('wordprocessing') ? 'docx' : 'xlsx'
        const { data: newDoc } = await supabase.from('documents').insert({
          account_id: accountId,
          company_id: companyId ?? null,
          user_id: profile.id,
          note_id: note.id,
          file_name: item.file.name,
          file_url: filePath,
          file_type: fileType,
          title: item.file.name.replace(/\.[^.]+$/, ''),
          is_deleted: false,
          workspace_id: workspaceId ?? null,
        }).select().single()
        if (!isImage && newDoc) {
          fetch('/api/index-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_id: newDoc.id, file_url: filePath, file_type: fileType, account_id: accountId, company_id: companyId, workspace_id: workspaceId }),
          }).catch(console.error)
        }
      }
    }

    // 4. Re-index note
    if (accountId) {
      fetch('/api/index-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: note.id, content: updatedNote.content, account_id: accountId, company_id: companyId, workspace_id: workspaceId }),
      }).catch(console.error)
    }

    onUpdate?.(updatedNote as Note)
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const authorName = membersMap[note.user_id] ?? null

  const visibleDocs = noteDocuments.filter((d) => !removedDocIds.has(d.id))

  // ── READ MODE ────────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-4 relative group transition-all duration-150 ${saved ? 'border-green-300' : 'border-gray-100'}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${note.source === 'vocal' ? 'bg-red-50' : 'bg-blue-50'}`}>
              {note.source === 'vocal'
                ? <Mic className="w-3.5 h-3.5 text-red-500" />
                : <Type className="w-3.5 h-3.5 text-[#3B82F6]" />}
            </div>
            <div>
              <p className="text-xs font-medium text-[#1E293B]">{authorName ?? note.user_id?.slice(0, 8)}</p>
              <p className="text-xs text-[#94A3B8]">{formatDate(note.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {saved && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}

            {/* Edit button — hover on desktop, always on mobile */}
            {onUpdate && !confirming && (
              <button
                onClick={startEdit}
                className="p-1.5 rounded-lg transition-all duration-150 md:opacity-0 md:group-hover:opacity-100"
                style={{ color: '#8899BB' }}
                title="Modifier"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            {confirming ? (
              <div className="flex gap-1">
                <button onClick={() => onDelete(note.id)} className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors">
                  Supprimer
                </button>
                <button onClick={() => setConfirming(false)} className="px-2 py-1 text-xs font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all duration-150"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        {note.title && (
          <p className="text-sm font-semibold text-[#1E293B] mb-1">{note.title}</p>
        )}

        {/* Content */}
        <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{note.content}</p>

        {/* Attached docs */}
        {visibleDocs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {visibleDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onOpenDoc?.(doc)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all hover:bg-[#F0F4FF]"
                style={{ background: 'rgba(76,110,245,0.06)', color: '#4C6EF5', border: '1px solid rgba(76,110,245,0.12)' }}
              >
                {doc.file_type === 'image' ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                <span className="truncate max-w-[120px]">{doc.title ?? doc.file_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── EDIT MODE ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-[#4C6EF5]/30 shadow-sm p-4 space-y-3"
      style={{ boxShadow: '0 0 0 3px rgba(76,110,245,0.08)' }}>

      {/* Title input */}
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        placeholder="Titre (optionnel)"
        className="w-full text-sm font-semibold text-[#1E293B] placeholder-[#94A3B8] bg-transparent focus:outline-none pb-1"
        style={{ borderBottom: '1.5px solid rgba(76,110,245,0.3)' }}
      />

      {/* Content textarea */}
      <textarea
        ref={textareaRef}
        value={editContent}
        onChange={(e) => {
          setEditContent(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = e.target.scrollHeight + 'px'
        }}
        className="w-full text-sm text-[#1E293B] leading-relaxed resize-none focus:outline-none bg-transparent"
        style={{ minHeight: 80, overflow: 'hidden' }}
      />

      {/* Existing attachments */}
      {noteDocuments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {noteDocuments.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all"
              style={removedDocIds.has(doc.id)
                ? { background: 'rgba(239,68,68,0.06)', color: '#94A3B8', textDecoration: 'line-through', border: '1px solid rgba(239,68,68,0.2)' }
                : { background: 'rgba(76,110,245,0.06)', color: '#4C6EF5', border: '1px solid rgba(76,110,245,0.12)' }
              }
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[100px]">{doc.title ?? doc.file_name}</span>
              <button
                onClick={() => setRemovedDocIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(doc.id)) next.delete(doc.id)
                  else next.add(doc.id)
                  return next
                })}
                className="ml-0.5 hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New attachments preview */}
      {newAttachments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {newAttachments.map((item) => (
            <div key={item.id} className="relative group/att">
              {item.preview
                ? <img src={item.preview} alt={item.file.name} className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                : <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center"><FileText className="w-4 h-4 text-gray-300" /></div>
              }
              <p className="text-[10px] text-[#64748B] truncate w-14 mt-0.5">{item.file.name}</p>
              <button
                onClick={() => setNewAttachments((prev) => prev.filter((a) => a.id !== item.id))}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add file button */}
      <div>
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all">
          <Paperclip className="w-3.5 h-3.5" />Ajouter un fichier
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAddFile} />
        </label>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !editContent.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: '#1E2761', borderRadius: 10, height: 44 }}
        >
          {saving
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Save className="w-4 h-4" />
          }
          Sauvegarder
        </button>
        <button
          onClick={cancelEdit}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-[#1E2761] border-2 border-[#1E2761]/20 hover:border-[#1E2761]/40 transition-all disabled:opacity-50"
          style={{ borderRadius: 10, height: 44 }}
        >
          <X className="w-4 h-4" />
          Annuler
        </button>
      </div>
    </div>
  )
}

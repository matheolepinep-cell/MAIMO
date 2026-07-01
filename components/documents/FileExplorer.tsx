'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconFileTypePdf,
  IconFileTypeDocx,
  IconFileTypeXls,
  IconPhoto,
  IconUpload,
  IconFolderPlus,
  IconChevronRight,
  IconHome,
  IconDots,
  IconTrash,
  IconPencil,
  IconCheck,
  IconX,
  IconLayoutGrid,
  IconList,
  IconExternalLink,
  IconShare,
} from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { validateFile, sanitizeFilename } from '@/lib/file-validation'
import type { Document } from '@/types/database'

/* ─── Types ─── */
interface Folder {
  id: string
  name: string
  parent_id: string | null
  account_id: string | null
  created_at: string
}

interface FileExplorerProps {
  accountId: string
  companyId: string
  userId: string
  wsId: string | null
  onDocumentOpen?: (doc: Document) => void
  onDocumentDelete?: (docId: string) => void
}

/* ─── Utilities ─── */
function getFileType(file: File): 'pdf' | 'docx' | 'xlsx' | 'image' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.includes('pdf')) return 'pdf'
  if (file.type.includes('wordprocessingml')) return 'docx'
  return 'xlsx'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

/* ─── Icons ─── */
function FileTypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const s = { width: size, height: size }
  if (type === 'pdf') return <IconFileTypePdf style={s} color="#EF4444" />
  if (type === 'docx') return <IconFileTypeDocx style={s} color="#2563EB" />
  if (type === 'xlsx') return <IconFileTypeXls style={s} color="#16A34A" />
  if (type === 'image') return <IconPhoto style={s} color="#8B5CF6" />
  return <IconFile style={s} color="#94A3B8" />
}

function fileTypeBg(type: string): string {
  if (type === 'pdf') return '#FEF2F2'
  if (type === 'docx') return '#EFF6FF'
  if (type === 'xlsx') return '#F0FDF4'
  if (type === 'image') return '#F5F3FF'
  return '#F5F7FA'
}

/* ─── FileExplorer ─── */
export function FileExplorer({ accountId, companyId, userId, wsId, onDocumentOpen, onDocumentDelete }: FileExplorerProps) {
  const supabase = createClient()

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Fichiers' }])

  // Data
  const [folders, setFolders] = useState<Folder[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [view, setView] = useState<'grid' | 'list'>('list')
  const [uploading, setUploading] = useState(false)
  const [dragOverId, setDragOverId] = useState<string | 'root' | null>(null)
  const [draggingItem, setDraggingItem] = useState<{ type: 'folder' | 'document'; id: string } | null>(null)

  // Inline folder creation
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Context menu
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Delete confirm
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null)
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null)

  /* ─── Fetch ─── */
  const fetchContents = useCallback(async () => {
    setLoading(true)
    try {
      // Folders in current directory
      const folderParams = new URLSearchParams({ account_id: accountId })
      if (currentFolderId) folderParams.set('parent_id', currentFolderId)
      const fRes = await fetch(`/api/folders?${folderParams}`)
      const fData = await fRes.json()
      setFolders(fData.folders ?? [])

      // Documents in current folder
      let docQ = supabase
        .from('documents')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (currentFolderId) {
        docQ = docQ.eq('folder_id', currentFolderId)
      } else {
        docQ = docQ.is('folder_id', null)
      }

      const { data: docs } = await docQ
      setDocuments(docs ?? [])
    } finally {
      setLoading(false)
    }
  }, [accountId, currentFolderId])

  useEffect(() => { fetchContents() }, [fetchContents])

  // Close context menu on outside click
  useEffect(() => {
    if (!menuFolderId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFolderId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuFolderId])

  useEffect(() => {
    if (creatingFolder) setTimeout(() => newFolderInputRef.current?.focus(), 50)
  }, [creatingFolder])

  useEffect(() => {
    if (renamingId) setTimeout(() => renameInputRef.current?.select(), 50)
  }, [renamingId])

  /* ─── Navigation ─── */
  const navigateInto = (folder: Folder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    setMenuFolderId(null)
  }

  const navigateTo = (idx: number) => {
    const crumb = breadcrumbs[idx]
    setCurrentFolderId(crumb.id)
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
  }

  /* ─── Create folder ─── */
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); setNewFolderName(''); return }
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, account_id: accountId, parent_id: currentFolderId, workspace_id: wsId }),
    })
    if (res.ok) {
      setCreatingFolder(false)
      setNewFolderName('')
      fetchContents()
    }
  }

  /* ─── Rename folder ─── */
  const handleRename = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return }
    await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: renamingId, name: renameValue.trim() }),
    })
    setRenamingId(null)
    fetchContents()
  }

  /* ─── Delete folder ─── */
  const handleDeleteFolder = async (id: string) => {
    await fetch(`/api/folders?id=${id}`, { method: 'DELETE' })
    setConfirmDeleteFolderId(null)
    setMenuFolderId(null)
    fetchContents()
  }

  /* ─── Delete document ─── */
  const handleDeleteDoc = async (docId: string) => {
    await supabase.from('documents').update({ is_deleted: true }).eq('id', docId)
    setConfirmDeleteDocId(null)
    onDocumentDelete?.(docId)
    fetchContents()
  }

  /* ─── Upload ─── */
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const { valid } = await validateFile(file)
      if (!valid) continue
      const safeName = sanitizeFilename(file.name)
      const filePath = `${companyId}/${Date.now()}-${safeName}`
      const { error: storErr } = await supabase.storage.from('documents').upload(filePath, file)
      if (storErr) continue
      const fileType = getFileType(file)
      const { data: inserted } = await supabase.from('documents').insert({
        account_id: accountId,
        company_id: companyId,
        user_id: userId,
        note_id: null,
        folder_id: currentFolderId ?? null,
        file_name: safeName,
        file_url: `documents:${filePath}`,
        file_size: file.size,
        file_type: fileType,
        title: safeName.replace(/\.[^.]+$/, ''),
        is_deleted: false,
        workspace_id: wsId ?? null,
      }).select().single()
      if (inserted && fileType !== 'image') {
        fetch('/api/index-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: inserted.id, file_url: `documents:${filePath}`, file_type: fileType, account_id: accountId, company_id: companyId, workspace_id: wsId }),
        }).catch(() => {})
      }
    }
    e.target.value = ''
    setUploading(false)
    fetchContents()
  }

  /* ─── Drag and drop ─── */
  const handleDragStart = (type: 'folder' | 'document', id: string) => {
    setDraggingItem({ type, id })
  }

  const handleDrop = async (targetFolderId: string | null) => {
    if (!draggingItem) return
    setDragOverId(null)
    if (draggingItem.type === 'folder' && draggingItem.id === targetFolderId) return
    await fetch('/api/folders/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: draggingItem.type, id: draggingItem.id, folder_id: targetFolderId }),
    })
    setDraggingItem(null)
    fetchContents()
  }

  /* ─── Render ─── */
  const isEmpty = folders.length === 0 && documents.length === 0 && !loading

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {idx > 0 && <IconChevronRight size={12} color="#94A3B8" />}
              <button
                onClick={() => navigateTo(idx)}
                className="text-xs font-medium hover:underline truncate max-w-[120px]"
                style={{ color: idx === breadcrumbs.length - 1 ? '#1E293B' : '#2563EB' }}
                title={crumb.name}
              >
                {idx === 0 ? <IconHome size={13} style={{ display: 'inline', marginBottom: -1 }} /> : crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:bg-gray-100 transition-colors"
            title={view === 'grid' ? 'Vue liste' : 'Vue grille'}
          >
            {view === 'grid' ? <IconList size={15} /> : <IconLayoutGrid size={15} />}
          </button>
          <button
            onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ background: '#F5F7FA', color: '#64748B', border: '1px solid #E2E8F0' }}
          >
            <IconFolderPlus size={13} />
            <span className="hidden sm:inline">Dossier</span>
          </button>
          <label
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors text-white"
            style={{ background: '#2563EB' }}
          >
            {uploading
              ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><IconUpload size={13} /><span className="hidden sm:inline ml-1">Ajouter</span></>
            }
            <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Drop zone on root (when inside a subfolder, allow dropping back) */}
      {currentFolderId && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverId('root') }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => { e.preventDefault(); handleDrop(null) }}
          className="mb-2 px-3 py-1.5 rounded-lg text-xs text-center transition-all"
          style={{
            border: `1px dashed ${dragOverId === 'root' ? '#2563EB' : '#E2E8F0'}`,
            background: dragOverId === 'root' ? '#EFF6FF' : 'transparent',
            color: dragOverId === 'root' ? '#2563EB' : '#94A3B8',
          }}
        >
          Déposer ici pour remonter au dossier parent
        </div>
      )}

      {/* Inline folder creation */}
      {creatingFolder && (
        <div
          className="flex items-center gap-2 px-3 py-2 mb-1.5 rounded-xl"
          style={{ border: '1.5px solid #2563EB', background: '#EFF6FF' }}
        >
          <IconFolderPlus size={16} color="#2563EB" />
          <input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') } }}
            placeholder="Nom du dossier"
            className="flex-1 bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none"
          />
          <button onClick={handleCreateFolder} className="text-[#2563EB] hover:text-blue-700">
            <IconCheck size={15} />
          </button>
          <button onClick={() => { setCreatingFolder(false); setNewFolderName('') }} className="text-[#94A3B8] hover:text-[#64748B]">
            <IconX size={15} />
          </button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="py-8 text-center text-sm text-[#94A3B8]">
          Aucun fichier dans ce dossier
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-6 text-center">
          <span className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin inline-block" />
        </div>
      )}

      {/* Grid view */}
      {!loading && view === 'grid' && (folders.length > 0 || documents.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {folders.map(folder => (
            <FolderCard
              key={folder.id}
              folder={folder}
              isMenuOpen={menuFolderId === folder.id}
              isRenaming={renamingId === folder.id}
              renameValue={renamingId === folder.id ? renameValue : folder.name}
              renameInputRef={renamingId === folder.id ? renameInputRef : undefined}
              isDragOver={dragOverId === folder.id}
              confirmDelete={confirmDeleteFolderId === folder.id}
              onOpen={() => navigateInto(folder)}
              onMenuToggle={() => setMenuFolderId(id => id === folder.id ? null : folder.id)}
              onRenameStart={() => { setRenamingId(folder.id); setRenameValue(folder.name); setMenuFolderId(null) }}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRename}
              onRenameCancel={() => setRenamingId(null)}
              onDeleteRequest={() => { setConfirmDeleteFolderId(folder.id); setMenuFolderId(null) }}
              onDeleteConfirm={() => handleDeleteFolder(folder.id)}
              onDeleteCancel={() => setConfirmDeleteFolderId(null)}
              onDragStart={() => handleDragStart('folder', folder.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(folder.id) }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(folder.id) }}
              menuRef={menuFolderId === folder.id ? menuRef : undefined}
              view="grid"
            />
          ))}
          {documents.map(doc => (
            <DocCard
              key={doc.id}
              doc={doc}
              confirmDelete={confirmDeleteDocId === doc.id}
              onOpen={() => onDocumentOpen?.(doc)}
              onDeleteRequest={() => setConfirmDeleteDocId(doc.id)}
              onDeleteConfirm={() => handleDeleteDoc(doc.id)}
              onDeleteCancel={() => setConfirmDeleteDocId(null)}
              onDragStart={() => handleDragStart('document', doc.id)}
              view="grid"
            />
          ))}
        </div>
      )}

      {/* List view */}
      {!loading && view === 'list' && (folders.length > 0 || documents.length > 0) && (
        <div className="space-y-1">
          {folders.map(folder => (
            <FolderCard
              key={folder.id}
              folder={folder}
              isMenuOpen={menuFolderId === folder.id}
              isRenaming={renamingId === folder.id}
              renameValue={renamingId === folder.id ? renameValue : folder.name}
              renameInputRef={renamingId === folder.id ? renameInputRef : undefined}
              isDragOver={dragOverId === folder.id}
              confirmDelete={confirmDeleteFolderId === folder.id}
              onOpen={() => navigateInto(folder)}
              onMenuToggle={() => setMenuFolderId(id => id === folder.id ? null : folder.id)}
              onRenameStart={() => { setRenamingId(folder.id); setRenameValue(folder.name); setMenuFolderId(null) }}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRename}
              onRenameCancel={() => setRenamingId(null)}
              onDeleteRequest={() => { setConfirmDeleteFolderId(folder.id); setMenuFolderId(null) }}
              onDeleteConfirm={() => handleDeleteFolder(folder.id)}
              onDeleteCancel={() => setConfirmDeleteFolderId(null)}
              onDragStart={() => handleDragStart('folder', folder.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(folder.id) }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(folder.id) }}
              menuRef={menuFolderId === folder.id ? menuRef : undefined}
              view="list"
            />
          ))}
          {documents.map(doc => (
            <DocCard
              key={doc.id}
              doc={doc}
              confirmDelete={confirmDeleteDocId === doc.id}
              onOpen={() => onDocumentOpen?.(doc)}
              onDeleteRequest={() => setConfirmDeleteDocId(doc.id)}
              onDeleteConfirm={() => handleDeleteDoc(doc.id)}
              onDeleteCancel={() => setConfirmDeleteDocId(null)}
              onDragStart={() => handleDragStart('document', doc.id)}
              view="list"
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── FolderCard ─── */
interface FolderCardProps {
  folder: Folder
  isMenuOpen: boolean
  isRenaming: boolean
  renameValue: string
  renameInputRef?: React.RefObject<HTMLInputElement | null>
  isDragOver: boolean
  confirmDelete: boolean
  onOpen: () => void
  onMenuToggle: () => void
  onRenameStart: () => void
  onRenameChange: (v: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  menuRef?: React.RefObject<HTMLDivElement | null>
  view: 'grid' | 'list'
}

function FolderCard({ folder, isMenuOpen, isRenaming, renameValue, renameInputRef, isDragOver, confirmDelete, onOpen, onMenuToggle, onRenameStart, onRenameChange, onRenameSubmit, onRenameCancel, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onDragStart, onDragOver, onDragLeave, onDrop, menuRef, view }: FolderCardProps) {
  if (view === 'grid') {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="relative rounded-xl p-3 flex flex-col items-center gap-2 cursor-pointer group transition-all"
        style={{
          border: `1.5px solid ${isDragOver ? '#2563EB' : 'rgba(30,39,97,0.07)'}`,
          background: isDragOver ? '#EFF6FF' : '#FAFAFA',
        }}
        onClick={onOpen}
      >
        {isDragOver ? <IconFolderOpen size={32} color="#2563EB" /> : <IconFolder size={32} color="#F59E0B" />}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel() }}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-center w-full bg-white border border-[#2563EB] rounded px-1 focus:outline-none"
          />
        ) : (
          <p className="text-xs font-medium text-[#1E293B] text-center truncate w-full">{folder.name}</p>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
          className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200"
        >
          <IconDots size={12} color="#64748B" />
        </button>
        {isMenuOpen && (
          <div ref={menuRef} onClick={(e) => e.stopPropagation()} className="absolute top-7 right-1.5 z-20 bg-white rounded-xl shadow-lg py-1 min-w-[120px]" style={{ border: '1px solid #E2E8F0' }}>
            <button onClick={onRenameStart} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-[#1E293B] hover:bg-gray-50">
              <IconPencil size={12} /> Renommer
            </button>
            <button onClick={onDeleteRequest} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
              <IconTrash size={12} /> Supprimer
            </button>
          </div>
        )}
        {confirmDelete && (
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center gap-2 z-10">
            <p className="text-[11px] text-center text-[#1E293B] px-2">Supprimer le dossier et son contenu ?</p>
            <div className="flex gap-2">
              <button onClick={onDeleteConfirm} className="px-2 py-1 text-[10px] font-medium text-white bg-red-500 rounded-lg">Oui</button>
              <button onClick={onDeleteCancel} className="px-2 py-1 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg">Non</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl group cursor-pointer transition-all"
      style={{
        border: `1px solid ${isDragOver ? '#2563EB' : 'rgba(30,39,97,0.07)'}`,
        background: isDragOver ? '#EFF6FF' : 'transparent',
      }}
      onClick={onOpen}
    >
      {isDragOver ? <IconFolderOpen size={18} color="#2563EB" /> : <IconFolder size={18} color="#F59E0B" />}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel() }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-sm bg-white border border-[#2563EB] rounded px-1 focus:outline-none"
        />
      ) : (
        <span className="flex-1 text-sm font-medium text-[#1E293B] truncate">{folder.name}</span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        {confirmDelete ? (
          <>
            <button onClick={onDeleteConfirm} className="px-2 py-0.5 text-[10px] font-medium text-white bg-red-500 rounded-lg">Sup.</button>
            <button onClick={onDeleteCancel} className="px-2 py-0.5 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg">✕</button>
          </>
        ) : (
          <>
            <button onClick={onRenameStart} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#94A3B8] hover:text-[#1E293B]" title="Renommer">
              <IconPencil size={13} />
            </button>
            <button onClick={onDeleteRequest} className="p-1.5 rounded-lg hover:bg-red-50 text-[#94A3B8] hover:text-red-400" title="Supprimer">
              <IconTrash size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── DocCard ─── */
interface DocCardProps {
  doc: Document
  confirmDelete: boolean
  onOpen: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onDragStart: () => void
  view: 'grid' | 'list'
}

function DocCard({ doc, confirmDelete, onOpen, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onDragStart, view }: DocCardProps) {
  const label = doc.title ?? doc.file_name
  const size = (doc as Document & { file_size?: number }).file_size

  if (view === 'grid') {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        className="relative rounded-xl p-3 flex flex-col items-center gap-2 cursor-pointer group transition-all hover:shadow-sm"
        style={{ border: '1px solid rgba(30,39,97,0.07)', background: '#FAFAFA' }}
        onClick={onOpen}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: fileTypeBg(doc.file_type) }}>
          <FileTypeIcon type={doc.file_type} size={22} />
        </div>
        <p className="text-xs font-medium text-[#1E293B] text-center truncate w-full" title={label}>{label}</p>
        <p className="text-[10px] text-[#94A3B8]">{fmtDate(doc.created_at)}</p>
        {confirmDelete ? (
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center gap-2 z-10">
            <p className="text-[11px] text-center text-[#1E293B] px-2">Supprimer ce fichier ?</p>
            <div className="flex gap-2">
              <button onClick={onDeleteConfirm} className="px-2 py-1 text-[10px] font-medium text-white bg-red-500 rounded-lg">Oui</button>
              <button onClick={onDeleteCancel} className="px-2 py-1 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg">Non</button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteRequest() }}
            className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 text-[#94A3B8] hover:text-red-400"
          >
            <IconTrash size={12} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 rounded-xl group transition-all hover:bg-gray-50"
      style={{ border: '1px solid rgba(30,39,97,0.07)' }}
    >
      <button onClick={onOpen} className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: fileTypeBg(doc.file_type) }}>
          <FileTypeIcon type={doc.file_type} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#1E293B] truncate">{label}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-[#94A3B8]">{fmtDate(doc.created_at)}</span>
            {size != null && <span className="text-[10px] text-[#94A3B8]">· {formatFileSize(size)}</span>}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
        <button onClick={onOpen} className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#0A0A0A] hover:bg-[#F5F5F5] transition-colors" title="Ouvrir">
          <IconExternalLink size={13} />
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={onDeleteConfirm} className="px-2 py-0.5 text-[10px] font-medium text-white bg-red-500 rounded-lg">Sup.</button>
            <button onClick={onDeleteCancel} className="px-2 py-0.5 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg">✕</button>
          </div>
        ) : (
          <button onClick={onDeleteRequest} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
            <IconTrash size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

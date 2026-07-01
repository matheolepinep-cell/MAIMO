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
  IconSparkles,
  IconAlertTriangle,
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

interface PendingIndexDoc {
  id: string
  name: string
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

/* ─── File type helpers ─── */
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

/* ─── IndexBadge ─── */
function IndexBadge({ docId, isIndexed, indexingDocIds }: { docId: string; isIndexed: boolean; indexingDocIds: string[] }) {
  const isIndexing = indexingDocIds.includes(docId)

  if (isIndexing) return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 10,
      background: '#EFF6FF', color: '#2563EB',
      display: 'flex', alignItems: 'center', gap: 4,
      flexShrink: 0,
    }}>
      <span className="animate-spin" style={{
        width: 8, height: 8, borderRadius: '50%',
        border: '1.5px solid #2563EB',
        borderTopColor: 'transparent',
        display: 'inline-block',
      }} />
      Indexation...
    </span>
  )

  if (isIndexed) return (
    <span
      title="Ce document est dans la mémoire de l'IA"
      style={{
        fontSize: 10, fontWeight: 600,
        padding: '2px 7px', borderRadius: 10,
        background: '#DCFCE7', color: '#16A34A',
        display: 'flex', alignItems: 'center', gap: 3,
        flexShrink: 0,
      }}
    >
      <IconSparkles size={10} />
      Dans l'IA
    </span>
  )

  return (
    <span
      title="Ce document n'est pas indexé dans l'IA"
      style={{
        fontSize: 10, fontWeight: 500,
        padding: '2px 7px', borderRadius: 10,
        background: '#F3F4F6', color: '#9CA3AF',
        flexShrink: 0,
      }}
    >
      Non indexé
    </span>
  )
}

/* ─── FileExplorer ─── */
export function FileExplorer({ accountId, companyId, userId, wsId, onDocumentOpen, onDocumentDelete }: FileExplorerProps) {
  const supabase = createClient()

  // Navigation
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
  const [deletingFolder, setDeletingFolder] = useState<{ id: string; name: string; docCount: number; subCount: number } | null>(null)
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null)

  // Indexation confirmation modal
  const [pendingIndexDoc, setPendingIndexDoc] = useState<PendingIndexDoc | null>(null)

  // Indexation in progress
  const [indexingDocIds, setIndexingDocIds] = useState<string[]>([])

  /* ─── Fetch ─── */
  const fetchContents = useCallback(async () => {
    setLoading(true)
    try {
      const folderParams = new URLSearchParams({ account_id: accountId })
      if (currentFolderId) folderParams.set('parent_id', currentFolderId)
      const fRes = await fetch(`/api/folders?${folderParams}`)
      const fData = await fRes.json()
      setFolders(fData.folders ?? [])

      let docQ = supabase
        .from('documents')
        .select('id, file_name, file_url, file_type, file_size, folder_id, is_indexed, indexed_at, created_at, user_id, title, account_id, company_id, workspace_id, is_deleted')
        .eq('account_id', accountId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (wsId) docQ = docQ.eq('workspace_id', wsId)

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

  useEffect(() => {
    if (!menuFolderId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFolderId(null)
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

  /* ─── Folder CRUD ─── */
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); setNewFolderName(''); return }
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, account_id: accountId, parent_id: currentFolderId, workspace_id: wsId }),
    })
    if (res.ok) { setCreatingFolder(false); setNewFolderName(''); fetchContents() }
  }

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

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const [{ count: docCount }, { count: subCount }] = await Promise.all([
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('folder_id', folderId).eq('is_deleted', false),
      supabase.from('folders').select('*', { count: 'exact', head: true }).eq('parent_id', folderId),
    ])
    setDeletingFolder({ id: folderId, name: folderName, docCount: docCount ?? 0, subCount: subCount ?? 0 })
  }

  const confirmDeleteFolder = async (folderId: string) => {
    setDeletingFolder(null)
    try {
      await fetch(`/api/folders?id=${folderId}`, { method: 'DELETE' })
      await supabase.from('documents').update({ is_deleted: true }).eq('folder_id', folderId)
    } catch (err) {
      console.error('[FileExplorer] delete folder error:', err)
    }
    fetchContents()
  }

  /* ─── Document delete ─── */
  const handleDeleteDoc = async (docId: string) => {
    await supabase.from('documents').update({ is_deleted: true }).eq('id', docId)
    setConfirmDeleteDocId(null)
    onDocumentDelete?.(docId)
    fetchContents()
  }

  /* ─── Ensure account folder exists in global Documents page ─── */
  const ensureAccountFolder = async () => {
    if (!wsId) return
    const { data: existing } = await supabase
      .from('folders')
      .select('id')
      .eq('company_id', companyId)
      .eq('folder_type', 'account')
      .eq('account_id', accountId)
      .is('parent_id', null)
      .maybeSingle()
    if (!existing) {
      const { data: account } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .single()
      if (account) {
        await supabase.from('folders').insert({
          company_id: companyId,
          name: account.name,
          folder_type: 'account',
          parent_id: null,
          account_id: accountId,
          workspace_id: wsId,
          created_by: userId,
        })
      }
    }
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
        folder_id: currentFolderId ?? null,
        file_name: safeName,
        file_url: `documents:${filePath}`,
        file_size: file.size,
        file_type: fileType,
        title: safeName.replace(/\.[^.]+$/, ''),
        is_deleted: false,
        is_indexed: false,
        workspace_id: wsId ?? null,
      }).select().single()
      // Images are not indexable; for other types show confirmation modal
      if (inserted && fileType !== 'image') {
        setPendingIndexDoc({ id: inserted.id, name: file.name })
      }
    }
    e.target.value = ''
    setUploading(false)
    // Ensure account folder exists in global Documents page
    ensureAccountFolder()
    fetchContents()
  }

  /* ─── Indexation confirm ─── */
  const handleConfirmIndex = async (doc: PendingIndexDoc) => {
    setPendingIndexDoc(null)
    setIndexingDocIds(prev => [...prev, doc.id])
    try {
      await fetch('/api/documents/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })
    } catch (err) {
      console.error('[FileExplorer] indexation error:', err)
    } finally {
      setIndexingDocIds(prev => prev.filter(id => id !== doc.id))
      fetchContents()
    }
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

      {/* Drop zone back to parent */}
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

      {isEmpty && (
        <div className="py-8 text-center text-sm text-[#94A3B8]">
          Aucun fichier dans ce dossier
        </div>
      )}

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
              onOpen={() => navigateInto(folder)}
              onMenuToggle={() => setMenuFolderId(id => id === folder.id ? null : folder.id)}
              onRenameStart={() => { setRenamingId(folder.id); setRenameValue(folder.name); setMenuFolderId(null) }}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRename}
              onRenameCancel={() => setRenamingId(null)}
              onDeleteRequest={() => { handleDeleteFolder(folder.id, folder.name); setMenuFolderId(null) }}
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
              isIndexing={indexingDocIds.includes(doc.id)}
              onOpen={() => onDocumentOpen?.(doc)}
              onDeleteRequest={() => setConfirmDeleteDocId(doc.id)}
              onDeleteConfirm={() => handleDeleteDoc(doc.id)}
              onDeleteCancel={() => setConfirmDeleteDocId(null)}
              onIndexRequest={() => handleConfirmIndex({ id: doc.id, name: doc.title ?? doc.file_name })}
              onDragStart={() => handleDragStart('document', doc.id)}
              indexingDocIds={indexingDocIds}
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
              onOpen={() => navigateInto(folder)}
              onMenuToggle={() => setMenuFolderId(id => id === folder.id ? null : folder.id)}
              onRenameStart={() => { setRenamingId(folder.id); setRenameValue(folder.name); setMenuFolderId(null) }}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRename}
              onRenameCancel={() => setRenamingId(null)}
              onDeleteRequest={() => { handleDeleteFolder(folder.id, folder.name); setMenuFolderId(null) }}
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
              isIndexing={indexingDocIds.includes(doc.id)}
              onOpen={() => onDocumentOpen?.(doc)}
              onDeleteRequest={() => setConfirmDeleteDocId(doc.id)}
              onDeleteConfirm={() => handleDeleteDoc(doc.id)}
              onDeleteCancel={() => setConfirmDeleteDocId(null)}
              onIndexRequest={() => handleConfirmIndex({ id: doc.id, name: doc.title ?? doc.file_name })}
              onDragStart={() => handleDragStart('document', doc.id)}
              indexingDocIds={indexingDocIds}
              view="list"
            />
          ))}
        </div>
      )}

      {/* ─── Delete folder confirmation modal ─── */}
      {deletingFolder && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: '#ffffff', borderRadius: 16,
            padding: 28, maxWidth: 400, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#FEF2F2',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 16,
            }}>
              <IconAlertTriangle size={24} color="#DC2626" />
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A', margin: '0 0 8px 0' }}>
              Supprimer &ldquo;{deletingFolder.name}&rdquo; ?
            </h3>

            {(deletingFolder.docCount > 0 || deletingFolder.subCount > 0) ? (
              <div style={{
                background: '#FEF2F2', borderRadius: 8,
                padding: '12px 14px', marginBottom: 20,
                border: '1px solid #FECACA',
              }}>
                <p style={{ fontSize: 13, color: '#DC2626', margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                  Ce dossier contient :
                </p>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                  {deletingFolder.docCount > 0 && (
                    <li><strong>{deletingFolder.docCount}</strong> document{deletingFolder.docCount > 1 ? 's' : ''}</li>
                  )}
                  {deletingFolder.subCount > 0 && (
                    <li><strong>{deletingFolder.subCount}</strong> sous-dossier{deletingFolder.subCount > 1 ? 's' : ''}</li>
                  )}
                </ul>
                <p style={{ fontSize: 13, color: '#DC2626', margin: '8px 0 0 0', lineHeight: 1.5, fontWeight: 500 }}>
                  Tout le contenu sera supprimé définitivement.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px 0', lineHeight: 1.6 }}>
                Ce dossier est vide. La suppression est irréversible.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeletingFolder(null)}
                style={{
                  flex: 1, padding: '11px 16px',
                  border: '1px solid #E5E7EB', borderRadius: 10,
                  background: '#ffffff', color: '#374151',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => confirmDeleteFolder(deletingFolder.id)}
                style={{
                  flex: 1, padding: '11px 16px',
                  border: 'none', borderRadius: 10,
                  background: '#DC2626', color: '#ffffff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Indexation confirmation modal ─── */}
      {pendingIndexDoc && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: 28,
            maxWidth: 420, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#EFF6FF',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 16,
            }}>
              <IconSparkles size={24} color="#2563EB" />
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A', margin: '0 0 8px 0' }}>
              Indexer ce document dans l'IA ?
            </h3>

            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, margin: '0 0 6px 0' }}>
              Voulez-vous que ce document entre dans la mémoire de l'IA ? Vous pourrez ensuite l'interroger directement depuis la recherche IA.
            </p>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px',
              background: '#F9FAFB', borderRadius: 8,
              marginBottom: 16,
            }}>
              <IconFile size={14} color="#9CA3AF" />
              <span style={{
                fontSize: 12, color: '#374151',
                fontWeight: 500, fontStyle: 'italic',
                whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {pendingIndexDoc.name}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setPendingIndexDoc(null); fetchContents() }}
                style={{
                  flex: 1, padding: '11px 16px',
                  border: '1px solid #E5E7EB', borderRadius: 10,
                  background: '#ffffff', color: '#374151',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Non, stocker uniquement
              </button>
              <button
                onClick={() => handleConfirmIndex(pendingIndexDoc)}
                style={{
                  flex: 1, padding: '11px 16px',
                  border: 'none', borderRadius: 10,
                  background: '#2563EB', color: '#ffffff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Oui, indexer
              </button>
            </div>
          </div>
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
  onOpen: () => void
  onMenuToggle: () => void
  onRenameStart: () => void
  onRenameChange: (v: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onDeleteRequest: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  menuRef?: React.RefObject<HTMLDivElement | null>
  view: 'grid' | 'list'
}

function FolderCard({ folder, isMenuOpen, isRenaming, renameValue, renameInputRef, isDragOver, onOpen, onMenuToggle, onRenameStart, onRenameChange, onRenameSubmit, onRenameCancel, onDeleteRequest, onDragStart, onDragOver, onDragLeave, onDrop, menuRef, view }: FolderCardProps) {
  if (view === 'grid') {
    return (
      <div
        draggable onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        className="relative rounded-xl p-3 flex flex-col items-center gap-2 cursor-pointer group transition-all"
        style={{
          border: `1.5px solid ${isDragOver ? '#2563EB' : 'rgba(30,39,97,0.07)'}`,
          background: isDragOver ? '#EFF6FF' : '#FAFAFA',
        }}
        onClick={onOpen}
      >
        {isDragOver ? <IconFolderOpen size={32} color="#2563EB" /> : <IconFolder size={32} color="#F59E0B" />}
        {isRenaming ? (
          <input ref={renameInputRef} value={renameValue} onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel() }}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-center w-full bg-white border border-[#2563EB] rounded px-1 focus:outline-none"
          />
        ) : (
          <p className="text-xs font-medium text-[#1E293B] text-center truncate w-full">{folder.name}</p>
        )}
        <button onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
          className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200">
          <IconDots size={12} color="#64748B" />
        </button>
        {isMenuOpen && (
          <div ref={menuRef} onClick={(e) => e.stopPropagation()}
            className="absolute top-7 right-1.5 z-20 bg-white rounded-xl shadow-lg py-1 min-w-[120px]" style={{ border: '1px solid #E2E8F0' }}>
            <button onClick={onRenameStart} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-[#1E293B] hover:bg-gray-50">
              <IconPencil size={12} /> Renommer
            </button>
            <button onClick={onDeleteRequest} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
              <IconTrash size={12} /> Supprimer
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl group cursor-pointer transition-all"
      style={{
        border: `1px solid ${isDragOver ? '#2563EB' : 'rgba(30,39,97,0.07)'}`,
        background: isDragOver ? '#EFF6FF' : 'transparent',
      }}
      onClick={onOpen}
    >
      {isDragOver ? <IconFolderOpen size={18} color="#2563EB" /> : <IconFolder size={18} color="#F59E0B" />}
      {isRenaming ? (
        <input ref={renameInputRef} value={renameValue} onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel() }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-sm bg-white border border-[#2563EB] rounded px-1 focus:outline-none"
        />
      ) : (
        <span className="flex-1 text-sm font-medium text-[#1E293B] truncate">{folder.name}</span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button onClick={onRenameStart} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#94A3B8] hover:text-[#1E293B]" title="Renommer">
          <IconPencil size={13} />
        </button>
        <button onClick={onDeleteRequest} className="p-1.5 rounded-lg hover:bg-red-50 text-[#94A3B8] hover:text-red-400" title="Supprimer">
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  )
}

/* ─── DocCard ─── */
interface DocCardProps {
  doc: Document
  confirmDelete: boolean
  isIndexing: boolean
  onOpen: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onIndexRequest: () => void
  onDragStart: () => void
  indexingDocIds: string[]
  view: 'grid' | 'list'
}

function DocCard({ doc, confirmDelete, isIndexing, onOpen, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onIndexRequest, onDragStart, indexingDocIds, view }: DocCardProps) {
  const label = doc.title ?? doc.file_name
  const size = doc.file_size
  const canIndex = doc.file_type !== 'image' && !doc.is_indexed && !isIndexing

  if (view === 'grid') {
    return (
      <div
        draggable onDragStart={onDragStart}
        className="relative rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer group transition-all hover:shadow-sm"
        style={{ border: '1px solid rgba(30,39,97,0.07)', background: '#FAFAFA' }}
        onClick={onOpen}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: fileTypeBg(doc.file_type) }}>
          <FileTypeIcon type={doc.file_type} size={22} />
        </div>
        <p className="text-xs font-medium text-[#1E293B] text-center truncate w-full" title={label}>{label}</p>
        <p className="text-[10px] text-[#94A3B8]">{fmtDate(doc.created_at)}</p>
        {doc.file_type !== 'image' && (
          <div style={{ marginTop: 2, display: 'flex', justifyContent: 'center' }}>
            <IndexBadge docId={doc.id} isIndexed={doc.is_indexed} indexingDocIds={indexingDocIds} />
          </div>
        )}
        {confirmDelete ? (
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center gap-2 z-10">
            <p className="text-[11px] text-center text-[#1E293B] px-2">Supprimer ce fichier ?</p>
            <div className="flex gap-2">
              <button onClick={onDeleteConfirm} className="px-2 py-1 text-[10px] font-medium text-white bg-red-500 rounded-lg">Oui</button>
              <button onClick={onDeleteCancel} className="px-2 py-1 text-[10px] font-medium text-[#64748B] bg-gray-100 rounded-lg">Non</button>
            </div>
          </div>
        ) : (
          <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            {canIndex && (
              <button onClick={onIndexRequest} className="p-1 rounded hover:bg-blue-50" title="Indexer dans l'IA">
                <IconSparkles size={12} color="#2563EB" />
              </button>
            )}
            <button onClick={onDeleteRequest} className="p-1 rounded hover:bg-red-50 text-[#94A3B8] hover:text-red-400">
              <IconTrash size={12} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      draggable onDragStart={onDragStart}
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
            {doc.file_type !== 'image' && (
              <IndexBadge docId={doc.id} isIndexed={doc.is_indexed} indexingDocIds={indexingDocIds} />
            )}
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
          <>
            {canIndex && (
              <button
                onClick={(e) => { e.stopPropagation(); onIndexRequest() }}
                className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                title="Indexer dans l'IA"
              >
                <IconSparkles size={13} color="#2563EB" />
              </button>
            )}
            <button onClick={onDeleteRequest} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
              <IconTrash size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

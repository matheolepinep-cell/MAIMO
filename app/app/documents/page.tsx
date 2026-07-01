'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconFolder,
  IconFolderPlus,
  IconFileTypePdf,
  IconFileTypeDocx,
  IconFileTypeXls,
  IconPhoto,
  IconFile,
  IconUpload,
  IconDownload,
  IconEye,
  IconTrash,
  IconList,
  IconLayoutGrid,
  IconChevronRight,
  IconSparkles,
  IconArrowRight,
  IconAlertTriangle,
  IconX,
  IconSearch,
} from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { validateFile, sanitizeFilename } from '@/lib/file-validation'

/* ─── Types ─── */
interface GlobalFolder {
  id: string
  name: string
  folder_type: 'general' | 'account' | 'custom'
  parent_id: string | null
  account_id: string | null
  doc_count?: number
}

interface GlobalDocument {
  id: string
  file_name: string
  file_url: string
  file_type: 'pdf' | 'docx' | 'xlsx' | 'image'
  file_size: number | null
  folder_id: string | null
  account_id: string | null
  is_indexed: boolean
  created_at: string
  account_name?: string
}

/* ─── Helpers ─── */
function getFileType(file: File): 'pdf' | 'docx' | 'xlsx' | 'image' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.includes('pdf')) return 'pdf'
  if (file.type.includes('wordprocessingml')) return 'docx'
  return 'xlsx'
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

/* ─── FileTypeIcon ─── */
function FileTypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const s = { width: size, height: size }
  if (type === 'pdf') return <IconFileTypePdf style={s} color="#EF4444" />
  if (type === 'docx') return <IconFileTypeDocx style={s} color="#2563EB" />
  if (type === 'xlsx') return <IconFileTypeXls style={s} color="#16A34A" />
  if (type === 'image') return <IconPhoto style={s} color="#8B5CF6" />
  return <IconFile style={s} color="#94A3B8" />
}

/* ─── IndexBadge ─── */
function IndexBadge({ docId, isIndexed, indexingDocIds }: { docId: string; isIndexed: boolean; indexingDocIds: string[] }) {
  if (indexingDocIds.includes(docId)) return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span className="animate-spin" style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #2563EB', borderTopColor: 'transparent', display: 'inline-block' }} />
      Indexation...
    </span>
  )
  if (isIndexed) return (
    <span title="Dans la mémoire de l'IA" style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <IconSparkles size={10} />
      Dans l'IA
    </span>
  )
  return (
    <span title="Non indexé" style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10, background: '#F3F4F6', color: '#9CA3AF', flexShrink: 0 }}>
      Non indexé
    </span>
  )
}

/* ─── Page ─── */
export default function DocumentsPage() {
  const router = useRouter()
  const { profile } = useUser()
  const { wsId } = useWorkspace()
  const supabase = createClient()

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentFolder, setCurrentFolder] = useState<GlobalFolder | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<GlobalFolder[]>([])
  const [folders, setFolders] = useState<GlobalFolder[]>([])
  const [documents, setDocuments] = useState<GlobalDocument[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [movingDoc, setMovingDoc] = useState<GlobalDocument | null>(null)
  const [allFolders, setAllFolders] = useState<GlobalFolder[]>([])
  const [indexingDocIds, setIndexingDocIds] = useState<string[]>([])
  const [deletingFolder, setDeletingFolder] = useState<{ id: string; name: string; docCount: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ documents: GlobalDocument[]; isSearching: boolean } | null>(null)
  const didInit = useRef(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ─── Load content ─── */
  const loadContent = useCallback(async (folderId: string | null, folderObj: GlobalFolder | null = null) => {
    if (!profile) return
    const companyId = profile.company_id

    // Folders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let folderQ: any = supabase
      .from('folders')
      .select('id, name, folder_type, parent_id, account_id')
      .eq('company_id', companyId)
      .order('folder_type')
      .order('name')
    if (wsId) folderQ = folderQ.eq('workspace_id', wsId)

    if (!folderId) {
      // Root: only show general/account folders + custom folders created from this page
      // (exclude custom folders from fiche clients that have account_id but parent_id null)
      folderQ = folderQ
        .is('parent_id', null)
        .or('folder_type.eq.general,folder_type.eq.account,and(folder_type.eq.custom,account_id.is.null)')
    } else if (folderObj?.folder_type === 'account' && folderObj.account_id) {
      // Inside an account folder: show direct sub-folders + legacy root-level fiche client folders
      folderQ = folderQ.or(
        `parent_id.eq.${folderId},and(account_id.eq.${folderObj.account_id},parent_id.is.null,folder_type.eq.custom)`
      )
    } else {
      folderQ = folderQ.eq('parent_id', folderId)
    }
    const { data: folderData } = await folderQ

    const enriched: GlobalFolder[] = await Promise.all(
      ((folderData ?? []) as GlobalFolder[]).map(async (f) => {
        const { count } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', f.id)
          .eq('is_deleted', false)
        return { ...f, doc_count: count ?? 0 }
      })
    )
    setFolders(enriched)

    // Documents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let docQ: any = supabase
      .from('documents')
      .select('id, file_name, file_url, file_type, file_size, folder_id, account_id, is_indexed, created_at')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    if (wsId) docQ = docQ.or(`workspace_id.eq.${wsId},workspace_id.is.null`)
    if (folderId) docQ = docQ.eq('folder_id', folderId)
    else docQ = docQ.is('folder_id', null)
    const { data: docData } = await docQ

    const rows = (docData ?? []) as GlobalDocument[]
    const accountIds = [...new Set(rows.map((d) => d.account_id).filter(Boolean) as string[])]
    let accMap: Record<string, string> = {}
    if (accountIds.length > 0) {
      const { data: accs } = await supabase.from('accounts').select('id, name').in('id', accountIds)
      accMap = Object.fromEntries(((accs ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
    }
    setDocuments(rows.map((d) => ({ ...d, account_name: d.account_id ? accMap[d.account_id] : undefined })))

    // All folders for move modal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allQ: any = supabase.from('folders').select('id, name, folder_type, parent_id, account_id').eq('company_id', companyId).order('name')
    if (wsId) allQ = allQ.eq('workspace_id', wsId)
    const { data: allData } = await allQ
    setAllFolders((allData ?? []) as GlobalFolder[])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, wsId])

  /* ─── Create "Général" folder if missing ─── */
  const initializeFolders = useCallback(async () => {
    if (!profile) return
    const companyId = profile.company_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('folders')
      .select('id')
      .eq('company_id', companyId)
      .eq('folder_type', 'general')
      .is('parent_id', null)
    if (wsId) q = q.eq('workspace_id', wsId)
    const { data: existing } = await q
    if (!existing || existing.length === 0) {
      await supabase.from('folders').insert({
        name: 'Général',
        folder_type: 'general',
        parent_id: null,
        account_id: null,
        workspace_id: wsId ?? null,
        company_id: companyId,
        created_by: profile.id,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, wsId])

  useEffect(() => {
    if (!profile || didInit.current) return
    didInit.current = true
    initializeFolders().then(() => loadContent(null, null))
  }, [profile, initializeFolders, loadContent])

  /* ─── Navigation ─── */
  const navigateTo = (folderId: string | null, folder?: GlobalFolder) => {
    setCurrentFolderId(folderId)
    setCurrentFolder(folder ?? null)
    if (folderId === null) {
      setBreadcrumb([])
    } else if (folder) {
      const idx = breadcrumb.findIndex((b) => b.id === folderId)
      if (idx >= 0) {
        setBreadcrumb(breadcrumb.slice(0, idx + 1))
      } else {
        setBreadcrumb([...breadcrumb, folder])
      }
    }
    loadContent(folderId, folder ?? null)
  }

  /* ─── Create folder ─── */
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !profile) return
    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newFolderName.trim(),
        folder_type: 'custom',
        parent_id: currentFolderId,
        account_id: null,
        workspace_id: wsId,
      }),
    })
    setNewFolderName('')
    setIsCreatingFolder(false)
    loadContent(currentFolderId, currentFolder)
  }

  /* ─── Upload ─── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile) return
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const { valid } = await validateFile(file)
      if (!valid) continue
      const safeName = sanitizeFilename(file.name)
      const filePath = `${profile.company_id}/${Date.now()}-${safeName}`
      const { error: storErr } = await supabase.storage.from('documents').upload(filePath, file)
      if (storErr) continue
      await supabase.from('documents').insert({
        account_id: null,
        company_id: profile.company_id,
        user_id: profile.id,
        folder_id: currentFolderId ?? null,
        file_name: safeName,
        file_url: `documents:${filePath}`,
        file_size: file.size,
        file_type: getFileType(file),
        title: safeName.replace(/\.[^.]+$/, ''),
        is_deleted: false,
        is_indexed: false,
        is_global: true,
        workspace_id: wsId ?? null,
      })
    }
    e.target.value = ''
    setUploading(false)
    loadContent(currentFolderId, currentFolder)
  }

  /* ─── Open document (signed URL) ─── */
  const openDocument = async (docId: string) => {
    const res = await fetch(`/api/documents/${docId}/url`)
    const { url } = await res.json()
    if (url) window.open(url, '_blank')
  }

  /* ─── Move document ─── */
  const handleMoveDocument = async (targetFolderId: string | null) => {
    if (!movingDoc) return
    await fetch('/api/folders/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'document', id: movingDoc.id, folder_id: targetFolderId }),
    })
    setMovingDoc(null)
    loadContent(currentFolderId, currentFolder)
  }

  /* ─── Delete document ─── */
  const handleDeleteDocument = async (docId: string) => {
    await Promise.all([
      supabase.from('documents').update({ is_deleted: true }).eq('id', docId),
      supabase.from('chunks').delete().eq('source_id', docId).eq('source_type', 'document'),
    ])
    loadContent(currentFolderId, currentFolder)
  }

  /* ─── Reindex ─── */
  const handleIndex = async (docId: string) => {
    setIndexingDocIds((prev) => [...prev, docId])
    try {
      await fetch('/api/documents/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      })
    } finally {
      setIndexingDocIds((prev) => prev.filter((id) => id !== docId))
      loadContent(currentFolderId, currentFolder)
    }
  }

  /* ─── Search ─── */
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!searchQuery.trim() || !profile) {
      setSearchResults(null)
      return
    }
    setSearchResults({ documents: [], isSearching: true })
    searchTimerRef.current = setTimeout(async () => {
      const q = searchQuery.trim()
      const companyId = profile.company_id

      const { data: byName } = await supabase
        .from('documents')
        .select('id, file_name, file_url, file_type, file_size, folder_id, account_id, is_indexed, created_at')
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .ilike('file_name', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20)

      const { data: chunkMatches } = await supabase
        .from('chunks')
        .select('source_id')
        .eq('company_id', companyId)
        .eq('source_type', 'document')
        .ilike('content', `%${q}%`)
        .limit(30)

      const nameIds = new Set((byName ?? []).map((d) => d.id as string))
      const extraIds = [...new Set((chunkMatches ?? []).map((c) => c.source_id as string))].filter((id) => !nameIds.has(id))

      let extra: GlobalDocument[] = []
      if (extraIds.length > 0) {
        const { data: extraDocs } = await supabase
          .from('documents')
          .select('id, file_name, file_url, file_type, file_size, folder_id, account_id, is_indexed, created_at')
          .eq('company_id', companyId)
          .eq('is_deleted', false)
          .in('id', extraIds)
          .order('created_at', { ascending: false })
        extra = (extraDocs ?? []) as GlobalDocument[]
      }

      const combined = [...((byName ?? []) as GlobalDocument[]), ...extra]
      const accountIds = [...new Set(combined.map((d) => d.account_id).filter(Boolean) as string[])]
      let accMap: Record<string, string> = {}
      if (accountIds.length > 0) {
        const { data: accs } = await supabase.from('accounts').select('id, name').in('id', accountIds)
        accMap = Object.fromEntries(((accs ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
      }

      setSearchResults({
        documents: combined.map((d) => ({ ...d, account_name: d.account_id ? accMap[d.account_id] : undefined })),
        isSearching: false,
      })
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, profile])

  /* ─── Render ─── */
  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0A0A0A', margin: 0 }}>Documents</h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0 0' }}>Tous les documents du workspace</p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setViewMode('list')}
              style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: viewMode === 'list' ? '#ffffff' : 'transparent', cursor: 'pointer', color: '#6B7280', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <IconList size={15} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: viewMode === 'grid' ? '#ffffff' : 'transparent', cursor: 'pointer', color: '#6B7280', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <IconLayoutGrid size={15} />
            </button>
          </div>

          <button
            onClick={() => setIsCreatingFolder(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#ffffff', color: '#374151', fontSize: 13, cursor: 'pointer' }}
          >
            <IconFolderPlus size={14} />
            Nouveau dossier
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: uploading ? '#93C5FD' : '#2563EB', borderRadius: 8, color: '#ffffff', fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            <IconUpload size={14} />
            {uploading ? 'Upload...' : 'Importer'}
            <input type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <IconSearch size={15} color="#9CA3AF" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom de fichier ou contenu…"
          style={{ width: '100%', paddingLeft: 36, paddingRight: searchQuery ? 36 : 12, paddingTop: 10, paddingBottom: 10, fontSize: 13, border: '1px solid #E5E7EB', borderRadius: 10, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', color: '#0A0A0A' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.background = '#fff' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#FAFAFA' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6B7280', marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigateTo(null)}
          style={{ background: 'none', border: 'none', color: currentFolderId ? '#2563EB' : '#0A0A0A', cursor: currentFolderId ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, padding: 0 }}
        >
          Tous les documents
        </button>
        {breadcrumb.map((folder, i) => (
          <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconChevronRight size={12} color="#9CA3AF" />
            <button
              onClick={() => navigateTo(folder.id, folder)}
              style={{ background: 'none', border: 'none', padding: 0, color: i === breadcrumb.length - 1 ? '#0A0A0A' : '#2563EB', cursor: i === breadcrumb.length - 1 ? 'default' : 'pointer', fontSize: 13, fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {/* Inline folder creation */}
      {!searchResults && isCreatingFolder && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12, background: '#EFF6FF', borderRadius: 8, border: '1.5px solid #2563EB' }}>
          <IconFolder size={16} color="#2563EB" />
          <input
            autoFocus value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName('') } }}
            placeholder="Nom du dossier..."
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#0A0A0A', outline: 'none' }}
          />
          <button onClick={handleCreateFolder} style={{ padding: '5px 12px', background: '#2563EB', color: '#ffffff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Créer</button>
          <button onClick={() => { setIsCreatingFolder(false); setNewFolderName('') }} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 4 }}>
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* ── Search results ── */}
      {searchResults && (
        <div style={{ border: '1px solid #F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
          {searchResults.isSearching ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9CA3AF' }}>
              <div style={{ fontSize: 14 }}>Recherche en cours…</div>
            </div>
          ) : searchResults.documents.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9CA3AF' }}>
              <IconSearch size={40} color="#E5E7EB" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Aucun résultat</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Essayez d&apos;autres mots-clés</div>
            </div>
          ) : (
            searchResults.documents.map((doc) => (
              <div
                key={doc.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F9FAFB', background: '#ffffff', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
              >
                <FileTypeIcon type={doc.file_type} size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                    <span>· {formatDate(doc.created_at)}</span>
                    {doc.account_name && (
                      <>
                        <span>·</span>
                        <button onClick={() => doc.account_id && router.push(`/app/accounts/${doc.account_id}`)} style={{ background: 'none', border: 'none', padding: 0, color: '#2563EB', cursor: 'pointer', fontSize: 11 }}>
                          {doc.account_name}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <IndexBadge docId={doc.id} isIndexed={doc.is_indexed} indexingDocIds={indexingDocIds} />
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button onClick={() => openDocument(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }} title="Prévisualiser">
                    <IconEye size={14} />
                  </button>
                  {doc.file_type !== 'image' && !doc.is_indexed && (
                    <button onClick={() => handleIndex(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer' }} title="Indexer dans l'IA">
                      <IconSparkles size={14} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteDocument(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }} title="Supprimer">
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── List view ── */}
      {!searchResults && viewMode === 'list' && (
        <div style={{ border: '1px solid #F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
          {folders.map((folder) => (
            <div
              key={folder.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F9FAFB', background: '#ffffff', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
              onDoubleClick={() => navigateTo(folder.id, folder)}
            >
              <IconFolder
                size={20}
                color={folder.folder_type === 'general' ? '#6B7280' : folder.folder_type === 'account' ? '#2563EB' : '#F59E0B'}
                style={{ flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {folder.name}
                  {folder.folder_type === 'general' && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#F3F4F6', color: '#6B7280', fontWeight: 600 }}>Général</span>
                  )}
                  {folder.folder_type === 'account' && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#EFF6FF', color: '#2563EB', fontWeight: 600 }}>Client</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                  {folder.doc_count ?? 0} document{(folder.doc_count ?? 0) !== 1 ? 's' : ''}
                </div>
              </div>

              {folder.folder_type === 'account' && folder.account_id && (
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/app/accounts/${folder.account_id}`) }}
                  style={{ padding: '5px 10px', fontSize: 11, border: '1px solid #E5E7EB', borderRadius: 6, background: '#ffffff', color: '#6B7280', cursor: 'pointer', flexShrink: 0 }}
                >
                  Voir la fiche
                </button>
              )}

              {folder.folder_type === 'custom' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingFolder({ id: folder.id, name: folder.name, docCount: folder.doc_count ?? 0 }) }}
                  style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', borderRadius: 6 }}
                >
                  <IconTrash size={14} />
                </button>
              )}

              <IconChevronRight size={14} color="#9CA3AF" style={{ flexShrink: 0 }} />
            </div>
          ))}

          {documents.map((doc) => (
            <div
              key={doc.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F9FAFB', background: '#ffffff', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
            >
              <FileTypeIcon type={doc.file_type} size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.file_name}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                  <span>· {formatDate(doc.created_at)}</span>
                  {doc.account_name && (
                    <>
                      <span>·</span>
                      <button
                        onClick={() => doc.account_id && router.push(`/app/accounts/${doc.account_id}`)}
                        style={{ background: 'none', border: 'none', padding: 0, color: '#2563EB', cursor: 'pointer', fontSize: 11 }}
                      >
                        {doc.account_name}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <IndexBadge docId={doc.id} isIndexed={doc.is_indexed} indexingDocIds={indexingDocIds} />

              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <button onClick={() => openDocument(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }} title="Prévisualiser">
                  <IconEye size={14} />
                </button>
                <button onClick={() => openDocument(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }} title="Télécharger">
                  <IconDownload size={14} />
                </button>
                {doc.file_type !== 'image' && !doc.is_indexed && (
                  <button onClick={() => handleIndex(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer' }} title="Indexer dans l'IA">
                    <IconSparkles size={14} />
                  </button>
                )}
                <button onClick={() => setMovingDoc(doc)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }} title="Déplacer">
                  <IconArrowRight size={14} />
                </button>
                <button onClick={() => handleDeleteDocument(doc.id)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }} title="Supprimer">
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}

          {folders.length === 0 && documents.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9CA3AF' }}>
              <IconFolder size={40} color="#E5E7EB" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Aucun document ici</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Importez des fichiers ou naviguez dans un dossier</div>
            </div>
          )}
        </div>
      )}

      {/* ── Grid view ── */}
      {!searchResults && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {folders.map((folder) => (
            <div
              key={folder.id}
              onDoubleClick={() => navigateTo(folder.id, folder)}
              style={{ padding: '20px 12px', textAlign: 'center', border: '1px solid #F3F4F6', borderRadius: 12, background: '#ffffff', cursor: 'pointer', transition: 'all 0.15s', position: 'relative' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
            >
              <IconFolder
                size={44}
                color={folder.folder_type === 'general' ? '#9CA3AF' : folder.folder_type === 'account' ? '#2563EB' : '#F59E0B'}
              />
              <div className="line-clamp-2" style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginTop: 8 }}>
                {folder.name}
              </div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                {folder.doc_count ?? 0} doc{(folder.doc_count ?? 0) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}

          {documents.map((doc) => (
            <div
              key={doc.id}
              style={{ padding: '16px 12px', textAlign: 'center', border: '1px solid #F3F4F6', borderRadius: 12, background: '#ffffff', position: 'relative', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
            >
              <FileTypeIcon type={doc.file_type} size={36} />
              <div className="line-clamp-2" style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginTop: 8 }}>
                {doc.file_name}
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
                <IndexBadge docId={doc.id} isIndexed={doc.is_indexed} indexingDocIds={indexingDocIds} />
              </div>
              <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}>
                <button onClick={() => openDocument(doc.id)} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.95)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
                  <IconEye size={12} color="#6B7280" />
                </button>
                <button onClick={() => setMovingDoc(doc)} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.95)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
                  <IconArrowRight size={12} color="#6B7280" />
                </button>
                <button onClick={() => handleDeleteDocument(doc.id)} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.95)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
                  <IconTrash size={12} color="#9CA3AF" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Move document modal ── */}
      {movingDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#ffffff', borderRadius: 16, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Déplacer &ldquo;{movingDoc.file_name}&rdquo;</h3>
              <button onClick={() => setMovingDoc(null)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 4 }}>
                <IconX size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <button
                onClick={() => handleMoveDocument(null)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', marginBottom: 6, textAlign: 'left' }}
              >
                <IconFolder size={16} color="#9CA3AF" />
                <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Racine (sans dossier)</span>
              </button>

              {allFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveDocument(folder.id)}
                  disabled={folder.id === movingDoc.folder_id}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid transparent', background: folder.id === movingDoc.folder_id ? '#F3F4F6' : '#ffffff', cursor: folder.id === movingDoc.folder_id ? 'not-allowed' : 'pointer', marginBottom: 4, textAlign: 'left', opacity: folder.id === movingDoc.folder_id ? 0.5 : 1 }}
                  onMouseEnter={(e) => { if (folder.id !== movingDoc.folder_id) e.currentTarget.style.background = '#EFF6FF' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = folder.id === movingDoc.folder_id ? '#F3F4F6' : '#ffffff' }}
                >
                  <IconFolder size={16} color={folder.folder_type === 'general' ? '#9CA3AF' : folder.folder_type === 'account' ? '#2563EB' : '#F59E0B'} />
                  <span style={{ fontSize: 13, color: '#374151' }}>{folder.name}</span>
                  {folder.id === movingDoc.folder_id && (
                    <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>Dossier actuel</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete folder modal ── */}
      {deletingFolder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#ffffff', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <IconAlertTriangle size={24} color="#DC2626" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
              Supprimer &ldquo;{deletingFolder.name}&rdquo; ?
            </h3>
            {deletingFolder.docCount > 0 && (
              <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, border: '1px solid #FECACA' }}>
                <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>
                  Ce dossier contient <strong>{deletingFolder.docCount}</strong> document{deletingFolder.docCount !== 1 ? 's' : ''} qui seront supprimés.
                </p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeletingFolder(null)}
                style={{ flex: 1, padding: '11px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#ffffff', color: '#374151', fontSize: 14, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const { data: docs } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('folder_id', deletingFolder.id)
                    .eq('is_deleted', false)
                  if (docs && docs.length > 0) {
                    const ids = docs.map((d: { id: string }) => d.id)
                    await Promise.all([
                      supabase.from('documents').update({ is_deleted: true }).in('id', ids),
                      supabase.from('chunks').delete().in('source_id', ids.map(String)).eq('source_type', 'document'),
                    ])
                  }
                  await fetch(`/api/folders?id=${deletingFolder.id}`, { method: 'DELETE' })
                  setDeletingFolder(null)
                  loadContent(currentFolderId, currentFolder)
                }}
                style={{ flex: 1, padding: '11px 16px', border: 'none', borderRadius: 10, background: '#DC2626', color: '#ffffff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { NoteInput } from '@/components/notes/NoteInput'
import { NoteCard } from '@/components/notes/NoteCard'
import { Button } from '@/components/ui/Button'
import type { Account, Note } from '@/types/database'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile, loading: profileLoading } = useUser()
  const [client, setClient] = useState<Account | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const fetchData = async () => {
    const supabase = createClient()

    const [{ data: clientData }, { data: notesData }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase
        .from('notes')
        .select('*')
        .eq('account_id', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
    ])

    setClient(clientData ?? null)
    setNotes(notesData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!profileLoading) fetchData()
  }, [profileLoading, id])

  const handleDeleteNote = async (noteId: string) => {
    const supabase = createClient()
    await supabase.from('notes').update({ is_deleted: true }).eq('id', noteId)
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowed.includes(file.type)) {
      alert('Format non supporté. Utilisez PDF, DOCX ou XLSX.')
      return
    }

    setUploading(true)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const path = `${profile.company_id}/${id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file)

    if (uploadError) {
      alert('Erreur lors de l\'upload.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)

    const fileTypeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    }

    const { data: doc } = await supabase
      .from('documents')
      .insert({
        account_id: id,
        company_id: profile.company_id,
        user_id: profile.id,
        file_name: file.name,
        file_url: publicUrl,
        file_type: fileTypeMap[file.type],
        title: file.name.replace(/\.[^.]+$/, ''),
        is_deleted: false,
      })
      .select()
      .single()

    if (doc) {
      fetch('/api/index-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          file_url: publicUrl,
          file_type: fileTypeMap[file.type],
          client_id: id,
          company_id: profile.company_id,
        }),
      }).catch(console.error)
    }

    setUploading(false)
    e.target.value = ''
    alert('Fichier uploadé et indexation en cours.')
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-4 text-center text-[#64748B]">Client introuvable.</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-30">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl text-[#64748B] hover:bg-gray-100 transition-all duration-150"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[#1E293B] truncate">{client.name}</h1>
          {client.description && (
            <p className="text-xs text-[#64748B] truncate">{client.description}</p>
          )}
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".pdf,.docx,.xlsx"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-[#64748B] hover:bg-gray-50 transition-all duration-150">
            {uploading ? (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Fichier</span>
          </div>
        </label>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Note input */}
        <NoteInput clientId={id} onNoteSaved={fetchData} />

        {/* Notes list */}
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-[#64748B]">Aucune note pour ce client</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} onDelete={handleDeleteNote} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

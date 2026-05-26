'use client'

import { useState } from 'react'
import { Mic, Type, Trash2 } from 'lucide-react'
import type { Note } from '@/types/database'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

interface NoteCardProps {
  note: Note
  onDelete: (id: string) => void
}

export function NoteCard({ note, onDelete }: NoteCardProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${note.source === 'vocal' ? 'bg-red-50' : 'bg-blue-50'}`}>
            {note.source === 'vocal'
              ? <Mic className="w-3.5 h-3.5 text-red-500" />
              : <Type className="w-3.5 h-3.5 text-[#3B82F6]" />
            }
          </div>
          <div>
            <p className="text-xs font-medium text-[#1E293B]">{note.user_id}</p>
            <p className="text-xs text-[#94A3B8]">{formatDate(note.created_at)}</p>
          </div>
        </div>

        {confirming ? (
          <div className="flex gap-1">
            <button
              onClick={() => onDelete(note.id)}
              className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Supprimer
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-2 py-1 text-xs font-medium text-[#64748B] bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
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
      <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{note.content}</p>
    </div>
  )
}

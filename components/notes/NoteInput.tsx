'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Send, Type } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Button } from '@/components/ui/Button'

interface NoteInputProps {
  clientId: string
  onNoteSaved: () => void
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export function NoteInput({ clientId, onNoteSaved }: NoteInputProps) {
  const { profile } = useUser()
  const [mode, setMode] = useState<'text' | 'vocal'>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const saveNote = useCallback(async (content: string, source: 'text' | 'vocal') => {
    if (!content.trim()) return
    setSaveError('')
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        account_id: clientId,
        company_id: profile?.company_id ?? null,
        user_id: profile?.id ?? user?.id ?? null,
        title: title.trim() || null,
        content: content.trim(),
        source,
        is_deleted: false,
      })
      .select()
      .single()

    if (error) {
      setSaveError(error.message)
    } else if (note) {
      setTitle('')
      setText('')
      fetch('/api/index-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_id: note.id,
          content: note.content,
          account_id: clientId,
          company_id: profile?.company_id ?? null,
        }),
      }).catch(console.error)
      onNoteSaved()
    }

    setSaving(false)
  }, [profile, clientId, title, onNoteSaved])

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('La reconnaissance vocale n\'est pas supportée par ce navigateur.')
      return
    }

    const recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setText(transcript)
    }

    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
    setMode('vocal')
  }, [])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
    setRecording(false)
    if (text.trim()) saveNote(text, 'vocal')
  }, [text, saveNote])

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) saveNote(text, 'text')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('text')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
            mode === 'text' ? 'bg-[#1E2761] text-white' : 'text-[#64748B] hover:bg-gray-100'
          )}
        >
          <Type className="w-3.5 h-3.5" />
          Texte
        </button>
        <button
          onClick={() => setMode('vocal')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
            mode === 'vocal' ? 'bg-[#1E2761] text-white' : 'text-[#64748B] hover:bg-gray-100'
          )}
        >
          <Mic className="w-3.5 h-3.5" />
          Vocal
        </button>
      </div>

      {/* Optional title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre (optionnel)"
        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150 mb-3"
      />

      {mode === 'text' ? (
        <form onSubmit={handleTextSubmit} className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Saisir une note..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150"
          />
          {saveError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
          )}
          <Button type="submit" loading={saving} disabled={!text.trim()} className="w-full" size="sm">
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Enregistrer
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          {text && (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-[#1E293B] min-h-[60px]">
              {text}
              {recording && <span className="inline-block w-2 h-4 bg-red-500 ml-1 animate-pulse rounded-sm" />}
            </div>
          )}
          <div className="flex gap-2">
            {!recording ? (
              <button
                onClick={startRecording}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-500 font-medium text-sm hover:bg-red-100 transition-all duration-150"
              >
                <Mic className="w-5 h-5" />
                Démarrer l'enregistrement
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-all duration-150 animate-pulse"
              >
                <MicOff className="w-5 h-5" />
                Arrêter et sauvegarder
              </button>
            )}
          </div>
          {saveError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
          )}
          {text && !recording && (
            <Button onClick={() => saveNote(text, 'vocal')} loading={saving} className="w-full" size="sm">
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Sauvegarder la note
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

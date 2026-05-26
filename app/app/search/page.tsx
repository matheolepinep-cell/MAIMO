'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Search, Mic, MicOff, Volume2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Client } from '@/types/database'

interface Source {
  chunk_id: string
  source_type: 'note' | 'document'
  source_id: string
  excerpt: string
  author_name: string | null
  date: string | null
}

function formatDate(date: string | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date))
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export default function SearchPage() {
  const { profile } = useUser()
  const [clients, setClients] = useState<Pick<Client, 'id' | 'name'>[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    if (!profile) return
    const supabase = createClient()
    supabase
      .from('clients')
      .select('id, name')
      .eq('company_id', profile.company_id)
      .order('name')
      .then(({ data }) => setClients(data ?? []))
  }, [profile])

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query
    if (!searchQuery.trim() || !selectedClientId || !profile) return

    setLoading(true)
    setAnswer('')
    setSources([])

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          client_id: selectedClientId,
          company_id: profile.company_id,
        }),
      })

      const data = await res.json()
      setAnswer(data.answer ?? '')
      setSources(data.sources ?? [])

      // Read answer aloud if recording was used
      if (recording && data.answer && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(data.answer)
        utterance.lang = 'fr-FR'
        window.speechSynthesis.speak(utterance)
      }
    } catch {
      setAnswer('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }, [query, selectedClientId, profile, recording])

  const startVoiceQuery = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('Reconnaissance vocale non supportée.')
      return
    }

    const recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setQuery(transcript)
      setRecording(false)
      handleSearch(transcript)
    }

    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }, [handleSearch])

  const stopVoice = () => {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  const speakAnswer = () => {
    if (!answer || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(answer)
    utterance.lang = 'fr-FR'
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div>
      <Header title="Recherche" />
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Recherche</h1>

        {/* Client selector */}
        <div>
          <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Client</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150"
          >
            <option value="">Sélectionner un client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Query input */}
        <div>
          <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Question</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Quelle est la prochaine livraison prévue ?"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150"
            />
            <button
              onClick={recording ? stopVoice : startVoiceQuery}
              className={`p-2.5 rounded-xl transition-all duration-150 ${
                recording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'border border-gray-200 text-[#64748B] hover:bg-gray-50'
              }`}
            >
              {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <Button
          onClick={() => handleSearch()}
          loading={loading}
          disabled={!query.trim() || !selectedClientId}
          className="w-full"
          size="lg"
        >
          <Search className="w-4 h-4 mr-2" />
          Rechercher
        </Button>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce" />
          </div>
        )}

        {/* Answer */}
        {answer && !loading && (
          <Card>
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Réponse</span>
              <button
                onClick={speakAnswer}
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-gray-100 transition-all duration-150"
                title="Lire à voix haute"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{answer}</p>

            {sources.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-[#64748B] mb-2">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((source) => (
                    <button
                      key={source.chunk_id}
                      onClick={() => setExpandedSource(
                        expandedSource === source.chunk_id ? null : source.chunk_id
                      )}
                      className="px-2.5 py-1 rounded-lg bg-[#1E2761]/5 text-xs font-medium text-[#1E2761] hover:bg-[#1E2761]/10 transition-all duration-150"
                    >
                      {source.author_name
                        ? `${source.author_name} · ${formatDate(source.date)}`
                        : source.source_type === 'document' ? 'Document' : 'Note'}
                    </button>
                  ))}
                </div>

                {expandedSource && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      {sources.find((s) => s.chunk_id === expandedSource)?.excerpt}
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

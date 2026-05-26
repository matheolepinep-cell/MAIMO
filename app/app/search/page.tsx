'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Search, Mic, MicOff, Volume2, FileText, Upload, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { SearchSource } from '@/types/database'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

function fmt(d?: string) {
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

export default function SearchPage() {
  const { profile, loading: profileLoading } = useUser()
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<SearchSource[]>([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    if (profileLoading || !profile?.company_id) return
    const supabase = createClient()
    supabase
      .from('accounts')
      .select('id, name')
      .eq('company_id', profile.company_id)
      .order('name')
      .then(({ data }) => setAccounts(data ?? []))
  }, [profileLoading, profile])

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query
    if (!searchQuery.trim() || !selectedId || !profile) return

    setLoading(true)
    setAnswer('')
    setSources([])

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, client_id: selectedId, company_id: profile.company_id }),
      })
      const data = await res.json()
      setAnswer(data.answer ?? '')
      setSources(data.sources ?? [])

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
  }, [query, selectedId, profile, recording])

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Reconnaissance vocale non supportée.'); return }
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

  const stopVoice = () => { recognitionRef.current?.stop(); setRecording(false) }

  const speakAnswer = () => {
    if (!answer || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(answer)
    utterance.lang = 'fr-FR'
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div>
      <Header title="Recherche IA" />
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[#1E293B] hidden md:block">Recherche IA</h1>

        <div>
          <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Entreprise</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150"
          >
            <option value="">Sélectionner une entreprise...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

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
              onClick={recording ? stopVoice : startVoice}
              className={`p-2.5 rounded-xl transition-all duration-150 ${
                recording ? 'bg-red-500 text-white animate-pulse' : 'border border-gray-200 text-[#64748B] hover:bg-gray-50'
              }`}
            >
              {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <Button
          onClick={() => handleSearch()}
          loading={loading}
          disabled={!query.trim() || !selectedId}
          className="w-full"
          size="lg"
        >
          <Search className="w-4 h-4 mr-2" />
          Rechercher
        </Button>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 bg-[#3B82F6] rounded-full animate-bounce" />
          </div>
        )}

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
                    source.type === 'document' && source.url ? (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-all duration-150"
                      >
                        <Upload className="w-3 h-3" />
                        {source.title}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    ) : (
                      <span
                        key={source.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-xs font-medium text-blue-700"
                      >
                        <FileText className="w-3 h-3" />
                        {source.title}
                        {source.author && <span className="opacity-70">· {source.author}</span>}
                        {source.date && <span className="opacity-60">· {fmt(source.date)}</span>}
                      </span>
                    )
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Send } from 'lucide-react'
import { clsx } from 'clsx'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

const PLACEHOLDERS = [
  'Quel est le délai Ferretti ?',
  'Qui contacter chez Roux BTP ?',
  'Conditions remise Dupont ?',
  'Dernier RDV Bouygues ?',
  'Prochaine livraison ?',
]

interface SearchBarProps {
  onSubmit: (query: string) => void
  onVoiceResult?: (transcript: string) => void
  defaultValue?: string
  autoFocus?: boolean
  className?: string
  large?: boolean
  staticPlaceholder?: string
}

export function SearchBar({
  onSubmit,
  onVoiceResult,
  defaultValue = '',
  autoFocus = false,
  className,
  large = false,
  staticPlaceholder,
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue)
  const [isRecording, setIsRecording] = useState(false)
  const [idx, setIdx] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (staticPlaceholder) return
    const id = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 3500)
    return () => clearInterval(id)
  }, [staticPlaceholder])

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return
    onSubmit(value.trim())
  }, [value, onSubmit])

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Reconnaissance vocale non supportée.'); return }
    const r = new SR()
    r.lang = 'fr-FR'; r.continuous = false; r.interimResults = false
    r.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results[0][0].transcript
      setValue(t)
      setIsRecording(false)
      if (onVoiceResult) onVoiceResult(t)
      else onSubmit(t)
    }
    r.onerror = () => setIsRecording(false)
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
    r.start()
    setIsRecording(true)
  }, [onSubmit, onVoiceResult])

  const stopVoice = () => { recognitionRef.current?.stop(); setIsRecording(false) }

  const placeholder = staticPlaceholder ?? PLACEHOLDERS[idx]

  return (
    <div className={clsx('relative', className)}>
      <div className={clsx(
        'flex items-center gap-3 bg-slate-50 rounded-2xl border border-slate-100 focus-within:border-blue-200 focus-within:ring-2 focus-within:ring-blue-100 transition-all duration-200',
        large ? 'px-4 py-3.5' : 'px-3.5 py-3'
      )}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={placeholder}
          className={clsx(
            'flex-1 bg-transparent border-0 outline-none text-[#0F172A] placeholder-slate-400',
            large ? 'text-base' : 'text-sm'
          )}
        />
        {value.trim() && (
          <button onClick={handleSubmit} className="text-[#1E2761] hover:text-[#1a2254] transition-colors duration-200 shrink-0">
            <Send className={large ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        )}
        <button
          onClick={isRecording ? stopVoice : startVoice}
          className={clsx(
            'shrink-0 transition-all duration-200',
            isRecording ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:text-[#1E2761]'
          )}
        >
          {isRecording
            ? <MicOff className={large ? 'w-5 h-5' : 'w-4 h-4'} />
            : <Mic className={large ? 'w-5 h-5' : 'w-4 h-4'} />
          }
        </button>
      </div>
      {isRecording && (
        <div className="flex items-center gap-2 mt-2 px-1">
          <span className="text-xs text-red-500">Écoute en cours…</span>
          <div className="flex items-end gap-0.5" style={{ height: 14 }}>
            {[0, 150, 300, 150, 0].map((delay, i) => (
              <span
                key={i}
                className="w-0.5 bg-red-400 rounded-full origin-bottom"
                style={{ height: 14, animation: `waveBar 0.8s ease-in-out ${delay}ms infinite` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

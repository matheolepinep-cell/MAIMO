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
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

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

  const placeholder = staticPlaceholder ?? 'Posez votre question…'

  return (
    <div className={clsx('relative', className)}>
      <div
        className={clsx(
          'flex items-center gap-3 rounded-2xl transition-all duration-200',
          large ? 'px-4 py-3.5' : 'px-3.5 py-3'
        )}
        style={{
          background: 'rgba(240,244,255,0.9)',
          border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={placeholder}
          style={{
            outline: 'none',
            background: 'transparent',
            border: 'none',
          }}
          className={clsx(
            'flex-1 text-[#0F172A] placeholder-slate-400',
            large ? 'text-base' : 'text-sm'
          )}
        />
        {value.trim() && (
          <button
            onClick={handleSubmit}
            className="shrink-0 transition-all duration-200 hover:-translate-y-px"
            style={{ color: '#0A0A0A' }}
          >
            <Send className={large ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        )}
        <button
          onClick={isRecording ? stopVoice : startVoice}
          className={clsx(
            'shrink-0 transition-all duration-200',
            isRecording ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:text-[#0A0A0A]'
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

'use client'

import { Volume2, X, FileText, ExternalLink, Upload } from 'lucide-react'
import type { SearchSource } from '@/types/database'

function fmt(d?: string) {
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

interface AnswerCardProps {
  answer: string
  sources: SearchSource[]
  isLoading?: boolean
  onSpeak?: () => void
  onClear?: () => void
  onSourceClick?: (source: SearchSource) => void
}

export function AnswerCard({ answer, sources, isLoading, onSpeak, onClear, onSourceClick }: AnswerCardProps) {
  if (isLoading) {
    return (
      <div
        className="bg-white rounded-2xl p-5 space-y-3"
        style={{
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.05)',
        }}
      >
        <div className="h-3.5 bg-[#F5F5F5] rounded-lg animate-pulse w-3/4" />
        <div className="h-3.5 bg-[#F5F5F5] rounded-lg animate-pulse w-full" />
        <div className="h-3.5 bg-[#F5F5F5] rounded-lg animate-pulse w-5/6" />
        <div className="h-3.5 bg-[#F5F5F5] rounded-lg animate-pulse w-2/3" />
      </div>
    )
  }

  if (!answer) return null

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(30,39,97,0.07)',
        animation: 'fadeInUp 0.25s ease-out',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0A0A0A 0%, #0A0A0A 100%)' }}
          >
            <span className="text-white font-bold" style={{ fontSize: 9 }}>M</span>
          </div>
          <span className="text-xs font-extrabold tracking-widest text-[#0A0A0A]">MAIMOO</span>
          <span className="text-xs text-slate-400">
            {new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onSpeak && (
            <button onClick={onSpeak} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0A0A0A] hover:bg-[#F5F5F5] transition-all duration-200" title="Lire à voix haute">
              <Volume2 className="w-4 h-4" />
            </button>
          )}
          {onClear && (
            <button onClick={onClear} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-50 transition-all duration-200" title="Effacer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Answer body */}
      <div className="px-5 py-4">
        <p className="text-sm text-[#0F172A] leading-relaxed whitespace-pre-wrap">{answer}</p>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="px-5 pb-4 pt-0">
          <p className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-widest">Sources</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((src) => (
              <button
                key={src.id}
                onClick={() => onSourceClick?.(src)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all duration-200 ${
                  src.type === 'document'
                    ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    : 'bg-[#F5F5F5] text-[#0A0A0A] hover:bg-[rgba(0,0,0,0.06)]'
                }`}
              >
                {src.type === 'document' ? <Upload className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                <span className="truncate max-w-[120px]">{src.title}</span>
                {src.date && <span className="opacity-60 shrink-0">· {fmt(src.date)}</span>}
                {src.type === 'document' && src.url && <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

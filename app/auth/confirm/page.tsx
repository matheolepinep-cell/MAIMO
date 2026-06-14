'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function AuthConfirmPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(135deg, #0A0A0A 0%, #0A0A0A 100%)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-12">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-lg"
          style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
        >
          M
        </div>
        <span className="font-bold text-white text-xl tracking-tight">Maimoo</span>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center text-center"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Animated checkmark */}
        <div className="mb-6">
          <svg
            width="72"
            height="72"
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="checkmark-svg"
          >
            <circle
              cx="36"
              cy="36"
              r="32"
              stroke="#22C55E"
              strokeWidth="3"
              fill="rgba(34,197,94,0.1)"
              className="checkmark-circle"
            />
            <polyline
              points="22,37 32,47 50,27"
              stroke="#22C55E"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="checkmark-tick"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-black text-white mb-3">
          Email confirmé ✓
        </h1>
        <p className="text-sm text-white/60 leading-relaxed mb-8">
          Votre compte est activé.<br />
          Vous pouvez maintenant vous connecter.
        </p>

        <Link
          href="/"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-[#0A0A0A] transition-all duration-200 hover:opacity-90 hover:shadow-lg"
          style={{ background: 'white' }}
        >
          Accéder à Maimoo
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <p className="mt-8 text-xs text-white/30">© 2026 Maimoo</p>

      <style>{`
        @keyframes circle-draw {
          from { stroke-dashoffset: 201; opacity: 0; }
          10% { opacity: 1; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes tick-draw {
          from { stroke-dashoffset: 50; opacity: 0; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }
        .checkmark-circle {
          stroke-dasharray: 201;
          stroke-dashoffset: 201;
          animation: circle-draw 0.7s cubic-bezier(0.4,0,0.2,1) 0.1s forwards;
        }
        .checkmark-tick {
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
          animation: tick-draw 0.4s cubic-bezier(0.4,0,0.2,1) 0.65s forwards;
        }
      `}</style>
    </div>
  )
}

'use client'

import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

type Props = {
  type: 'error' | 'success' | 'warning'
  message: string
}

const config = {
  error: {
    bg: '#FEF2F2',
    border: '#FECACA',
    icon: AlertCircle,
    iconColor: '#EF4444',
    textColor: '#991B1B',
  },
  success: {
    bg: '#F0FDF4',
    border: '#BBF7D0',
    icon: CheckCircle2,
    iconColor: '#22C55E',
    textColor: '#166534',
  },
  warning: {
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: AlertTriangle,
    iconColor: '#D97706',
    textColor: '#92400E',
  },
}

export function FormMessage({ type, message }: Props) {
  if (!message) return null
  const { bg, border, icon: Icon, iconColor, textColor } = config[type]
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: '10px 14px',
        animation: 'fm-fadeIn 0.15s ease-out',
      }}
    >
      <style>{`@keyframes fm-fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Icon size={16} color={iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 14, color: textColor, lineHeight: 1.5 }}>{message}</span>
    </div>
  )
}

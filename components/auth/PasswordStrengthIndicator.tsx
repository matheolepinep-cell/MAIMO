'use client'

import { validatePassword } from '@/lib/password-validation'

interface Props {
  password: string
  focused: boolean
}

export function PasswordStrengthIndicator({ password, focused }: Props) {
  if (!focused && !password) return null

  const { score, label, color, checks } = validatePassword(password)

  const segments = [
    score >= 1 ? color : '#E5E7EB',
    score >= 2 ? color : '#E5E7EB',
    score >= 3 ? color : '#E5E7EB',
    score >= 4 ? color : '#E5E7EB',
  ]

  const criteria = [
    { label: '8 caractères minimum', met: checks.minLength },
    { label: 'Une majuscule', met: checks.hasUppercase },
    { label: 'Un chiffre', met: checks.hasNumber },
  ]

  return (
    <div className="mt-2 space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {segments.map((bg, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: bg,
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12, color, fontWeight: 500, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
          {password ? label : ''}
        </span>
      </div>

      {/* Criteria list */}
      <div className="space-y-1">
        {criteria.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5">
            <span style={{ fontSize: 11, color: c.met ? '#16A34A' : '#9CA3AF', lineHeight: 1 }}>
              {c.met ? '✓' : '✗'}
            </span>
            <span style={{ fontSize: 12, color: c.met ? '#16A34A' : '#9CA3AF' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

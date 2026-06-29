export interface PasswordStrength {
  score: number
  label: 'Trop court' | 'Faible' | 'Moyen' | 'Fort'
  color: string
  checks: {
    minLength: boolean
    hasUppercase: boolean
    hasNumber: boolean
    hasSpecialChar: boolean
  }
}

export function validatePassword(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[^A-Za-z0-9]/.test(password),
  }

  const score = Object.values(checks).filter(Boolean).length

  const labels = {
    0: 'Trop court',
    1: 'Faible',
    2: 'Moyen',
    3: 'Fort',
    4: 'Fort',
  } as const

  const colors = {
    0: '#DC2626',
    1: '#DC2626',
    2: '#F59E0B',
    3: '#16A34A',
    4: '#16A34A',
  } as const

  return {
    score,
    label: labels[score as keyof typeof labels],
    color: colors[score as keyof typeof colors],
    checks,
  }
}

export function isPasswordValid(password: string): boolean {
  const { checks } = validatePassword(password)
  return checks.minLength && checks.hasUppercase && checks.hasNumber
}

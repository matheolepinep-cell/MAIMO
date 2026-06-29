import { normalizeText, levenshtein } from '@/lib/search-utils'

export type AccountRow = {
  id: string
  name: string
  phone: string | null
  website: string | null
  industry: string | null
  revenue: string | null
  description: string | null
  city: string | null
}

function normalizeName(name: string): string {
  return normalizeText(name)
    .replace(/sas|sarl|eurl|sasu|earl|snc|sci/g, '')
}

export function findMatchingAccount(name: string, accounts: AccountRow[]): AccountRow | null {
  const norm = normalizeName(name)
  if (norm.length < 2) return null
  for (const acc of accounts) {
    const accNorm = normalizeName(acc.name)
    if (norm === accNorm) return acc
    if (accNorm.length >= 4 && (norm.includes(accNorm) || accNorm.includes(norm))) return acc
    if (norm.length >= 5 && accNorm.length >= 5 && levenshtein(norm, accNorm) <= 2) return acc
  }
  return null
}

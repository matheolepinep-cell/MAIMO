export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : 1 + Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1])
    }
  }
  return matrix[b.length][a.length]
}

type Account = { id: string; name: string }

export type DetectionConfidence = 'high' | 'medium' | 'low'

export type CompanyMatch = {
  account: Account
  confidence: DetectionConfidence
}

export function detectCompanyInQuery(query: string, accounts: Account[]): CompanyMatch | null {
  const queryWords = query.split(/\s+/).map(normalizeText).filter((w) => w.length >= 2)
  const queryFull = queryWords.join('')

  let bestMatch: CompanyMatch | null = null

  for (const account of accounts) {
    const nameFull = normalizeText(account.name)
    const nameWords = account.name.split(/\s+/).map(normalizeText).filter((w) => w.length >= 2)

    // High confidence: full normalized name included in query string (or vice versa)
    if (nameFull.length >= 4 && (queryFull.includes(nameFull) || nameFull.includes(queryFull) || queryWords.includes(nameFull))) {
      return { account, confidence: 'high' }
    }

    // High confidence: significant name word (>=5 chars) exactly matches a query word
    let highHit = false
    for (const nWord of nameWords) {
      if (nWord.length >= 5 && queryWords.includes(nWord)) {
        highHit = true
        break
      }
    }
    if (highHit) {
      if (!bestMatch || bestMatch.confidence !== 'high') bestMatch = { account, confidence: 'high' }
      continue
    }

    // Medium confidence: exact word match >=4 chars between query and name
    const mediumHit = nameWords.some(
      (nWord) => nWord.length >= 4 && queryWords.some((qWord) => qWord.length >= 4 && qWord === nWord)
    )
    if (mediumHit) {
      if (!bestMatch || bestMatch.confidence === 'low') bestMatch = { account, confidence: 'medium' }
      continue
    }

    // Low confidence: Levenshtein <= 2 between query word and name word (typo tolerance)
    if (!bestMatch) {
      let found = false
      for (const qWord of queryWords) {
        if (found || qWord.length < 5) continue
        if (nameFull.length >= 5 && levenshtein(qWord, nameFull) <= 2) {
          bestMatch = { account, confidence: 'low' }
          found = true
          break
        }
        for (const nWord of nameWords) {
          if (nWord.length < 5) continue
          if (levenshtein(qWord, nWord) <= 2) {
            bestMatch = { account, confidence: 'low' }
            found = true
            break
          }
        }
      }
    }
  }

  return bestMatch
}

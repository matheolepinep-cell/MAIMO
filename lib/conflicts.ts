export type ConflictItem = {
  existingInfo: string
  newInfo: string
  type: 'contradiction' | 'duplicate'
}

export type ConflictResult = {
  hasConflict: boolean
  hasDuplicate: boolean
  conflicts: ConflictItem[]
}

export async function detectConflicts(accountId: string, newContent: string): Promise<ConflictResult> {
  try {
    const res = await fetch('/api/conflicts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, newContent }),
    })
    if (!res.ok) return { hasConflict: false, hasDuplicate: false, conflicts: [] }
    return await res.json()
  } catch {
    return { hasConflict: false, hasDuplicate: false, conflicts: [] }
  }
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const MAGIC_BYTES: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
}

export async function validateFile(
  file: File
): Promise<{ valid: boolean; error?: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Fichier trop volumineux (max 10MB)' }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: 'Type de fichier non autorisé' }
  }

  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer).slice(0, 4)
  const magic = MAGIC_BYTES[file.type]

  if (magic) {
    const matches = magic.every((byte, i) => bytes[i] === byte)
    if (!matches) {
      return {
        valid: false,
        error: 'Le contenu du fichier ne correspond pas à son type déclaré',
      }
    }
  }

  return { valid: true }
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-\s]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100)
}

import { Mistral } from '@mistralai/mistralai'
import { env } from './env'

export async function extractTextFromPDF(
  buffer: Buffer,
  fileName?: string
): Promise<string> {
  try {
    console.log('[pdf-extract] Using Mistral OCR for:', fileName, 'size:', buffer.length)

    const client = new Mistral({ apiKey: env.mistralApiKey ?? '' })
    const base64PDF = buffer.toString('base64')

    const response = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: `data:application/pdf;base64,${base64PDF}`,
      },
    })

    const fullText = response.pages
      .map((page) => page.markdown)
      .join('\n\n')

    console.log('[pdf-extract] Mistral OCR result length:', fullText.length)
    console.log('[pdf-extract] Preview:', fullText.substring(0, 300))

    if (!fullText || fullText.trim().length < 20) {
      return `[Document PDF vide ou illisible : ${fileName ?? 'fichier'}]`
    }

    return fullText.trim()
  } catch (err) {
    console.error('[pdf-extract] Mistral OCR failed:', err)
    return `[Extraction PDF échouée : ${fileName ?? 'fichier'}]`
  }
}

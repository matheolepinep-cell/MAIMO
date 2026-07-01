import OpenAI from 'openai'
import { env } from './env'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json')

function cleanPDFText(raw: string): string {
  return raw
    .replace(/----------------Page \(\d+\) Break----------------/g, '\n')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isGibberish(text: string): boolean {
  const words = text.split(/\s+/).filter((w) => w.length > 2)
  if (words.length < 5) return true
  // High ratio of non-printable / non-ASCII characters → noise
  const nonAscii = (text.match(/[^\x20-\x7E]/g) ?? []).length
  if (nonAscii / text.length > 0.3) return true
  // Very long "words" are a sign of encoded garbage
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length
  if (avgWordLen > 15) return true
  return false
}

function extractTextFromBuffer(buffer: Buffer): string {
  const content = buffer.toString('latin1')
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? []
  return blocks
    .join('\n')
    .replace(/\(([^)]+)\)\s*Tj/g, '$1 ')
    .replace(/\(([^)]+)\)\s*TJ/g, '$1 ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function extractTextWithOCR(buffer: Buffer, fileName?: string): Promise<string> {
  try {
    const openai = new OpenAI({ apiKey: env.openaiApiKey ?? '' })
    const base64PDF = buffer.toString('base64')

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extrait tout le texte visible dans ce document PDF. Retourne uniquement le texte brut, sans commentaire ni mise en forme.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:application/pdf;base64,${base64PDF}`,
              detail: 'high',
            },
          },
        ],
      }],
    })

    const extracted = response.choices[0]?.message?.content ?? ''
    console.log('[pdf-extract] OCR result length:', extracted.length, 'preview:', extracted.substring(0, 200))
    return extracted
  } catch (err) {
    console.error('[pdf-extract] OCR failed:', err)
    return `[PDF scanné - OCR échoué : ${fileName ?? 'fichier'}]`
  }
}

export async function extractTextFromPDF(
  buffer: Buffer,
  fileName?: string
): Promise<string> {
  return new Promise((resolve) => {
    let resolved = false
    const done = (value: string) => {
      if (!resolved) { resolved = true; resolve(value) }
    }

    try {
      const pdfParser = new PDFParser(null, 1)

      pdfParser.on('pdfParser_dataError', async (errData: { parserError: Error }) => {
        console.error('[pdf-extract] parse error:', errData.parserError?.message ?? errData.parserError)
        // Buffer fallback then OCR before giving up
        const fallback = extractTextFromBuffer(buffer)
        if (fallback.length > 50 && !isGibberish(fallback)) {
          console.log('[pdf-extract] buffer fallback ok after parse error, length:', fallback.length)
          done(fallback)
          return
        }
        console.log('[pdf-extract] buffer fallback also poor, trying OCR after parse error')
        const ocr = await extractTextWithOCR(buffer, fileName)
        done(ocr)
      })

      pdfParser.on('pdfParser_dataReady', async () => {
        try {
          const raw = pdfParser.getRawTextContent() as string
          console.log('[pdf-extract] raw length:', raw?.length, 'raw preview:', JSON.stringify(raw?.substring(0, 500)))

          const cleaned = cleanPDFText(raw ?? '')
          console.log('[pdf-extract] cleaned length:', cleaned.length)

          // Layer 2: BT/ET buffer extraction
          if (cleaned.length < 100 || isGibberish(cleaned)) {
            console.log('[pdf-extract] pdf2json text is poor, trying buffer extraction')
            const bufferText = extractTextFromBuffer(buffer)
            console.log('[pdf-extract] buffer extraction length:', bufferText.length)

            if (bufferText.length > 100 && !isGibberish(bufferText)) {
              done(bufferText)
              return
            }

            // Layer 3: OCR via OpenAI Vision
            console.log('[pdf-extract] buffer extraction also poor, falling back to OCR')
            const ocr = await extractTextWithOCR(buffer, fileName)
            done(ocr)
            return
          }

          done(cleaned)
        } catch (err) {
          console.error('[pdf-extract] processing error:', err)
          done(`[Erreur extraction PDF : ${fileName ?? 'fichier'}]`)
        }
      })

      pdfParser.parseBuffer(buffer)
    } catch (err) {
      console.error('[pdf-extract] parseBuffer threw synchronously:', err)
      done(`[Erreur critique extraction PDF : ${fileName ?? 'fichier'}]`)
    }
  })
}

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
  const nonAscii = (text.match(/[^\x20-\x7E]/g) ?? []).length
  if (nonAscii / text.length > 0.3) return true
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

      pdfParser.on('pdfParser_dataError', (errData: { parserError: Error }) => {
        console.error('[pdf-extract] parse error:', errData.parserError?.message ?? errData.parserError)
        // Try buffer extraction before giving up
        const fallback = extractTextFromBuffer(buffer)
        console.log('[pdf-extract] buffer fallback after parse error, length:', fallback.length)
        // Return whatever we got — Claude handles noisy text better than a placeholder
        done(fallback.length > 30 ? fallback : `[Document PDF non lisible : ${fileName ?? 'fichier'}]`)
      })

      pdfParser.on('pdfParser_dataReady', () => {
        try {
          const raw = pdfParser.getRawTextContent() as string
          console.log('[pdf-extract] raw length:', raw?.length, 'raw preview:', JSON.stringify(raw?.substring(0, 500)))

          const cleaned = cleanPDFText(raw ?? '')
          console.log('[pdf-extract] cleaned length:', cleaned.length, 'isGibberish:', isGibberish(cleaned))

          if (cleaned.length < 100 || isGibberish(cleaned)) {
            console.log('[pdf-extract] pdf2json text is poor, trying buffer extraction')
            const bufferText = extractTextFromBuffer(buffer)
            console.log('[pdf-extract] buffer extraction length:', bufferText.length)

            // Pick whichever gave more usable text and pass it to Claude as-is.
            // analyzeDocument's prompt explicitly handles noisy/corrupted text.
            const best = bufferText.length > cleaned.length && !isGibberish(bufferText)
              ? bufferText
              : cleaned

            if (best.length < 30) {
              done(`[Document PDF scanné sans texte extractible : ${fileName ?? 'fichier'}]`)
              return
            }

            console.log('[pdf-extract] sending best effort text to Claude, length:', best.length)
            done(best)
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

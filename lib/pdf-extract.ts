// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json')

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
        done(`[Document PDF non extractible : ${fileName ?? 'fichier'}]`)
      })

      pdfParser.on('pdfParser_dataReady', () => {
        try {
          const raw = pdfParser.getRawTextContent() as string
          // Strip pdf2json page-break markers, trim whitespace
          const text = raw
            .replace(/----------------Page \(\d+\) Break----------------/g, '\n')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
          console.log('[pdf-extract] extracted length:', text.length, 'preview:', text.substring(0, 80))
          if (!text || text.length < 50) {
            done(`[Document PDF scanné sans texte extractible : ${fileName ?? 'fichier'}]`)
            return
          }
          done(text)
        } catch (err) {
          console.error('[pdf-extract] getRawTextContent error:', err)
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

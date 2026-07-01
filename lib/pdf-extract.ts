// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json')

export async function extractTextFromPDF(
  buffer: Buffer,
  fileName?: string
): Promise<string> {
  return new Promise((resolve) => {
    const pdfParser = new PDFParser(null, 1)

    pdfParser.on('pdfParser_dataError', (errData: { parserError: Error }) => {
      console.error('[pdf-extract] parse error:', errData.parserError)
      resolve(`[Document PDF non extractible : ${fileName ?? 'fichier'}]`)
    })

    pdfParser.on('pdfParser_dataReady', () => {
      try {
        const text = pdfParser.getRawTextContent() as string
        if (!text || text.trim().length < 50) {
          resolve(`[Document PDF scanné sans texte extractible : ${fileName ?? 'fichier'}]`)
          return
        }
        resolve(text.trim())
      } catch {
        resolve(`[Erreur extraction PDF : ${fileName ?? 'fichier'}]`)
      }
    })

    pdfParser.parseBuffer(buffer)
  })
}

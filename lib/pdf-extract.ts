export async function extractTextFromPDF(buffer: Buffer, fileName?: string): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''

    const uint8Array = new Uint8Array(buffer)
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useWorkerFetch: false,
      useSystemFonts: true,
    })

    const pdf = await loadingTask.promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => (item as { str?: string }).str ?? '')
        .join(' ')
      fullText += pageText + '\n'
    }

    const trimmed = fullText.trim()
    if (!trimmed || trimmed.length < 50) {
      return `[Document PDF scanné - contenu non extractible : ${fileName ?? 'document.pdf'}]`
    }
    return trimmed
  } catch (err) {
    console.error('[extractTextFromPDF] error:', err)
    throw err
  }
}

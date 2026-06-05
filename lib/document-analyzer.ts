import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ExtractedCompany = {
  name: string
  city: string | null
  sector: string | null
  status: 'client' | 'prospect' | null
  phone: string | null
  website: string | null
  revenue: string | null
  description: string | null
}

export type ExtractedContact = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  position: string | null
  companyName: string
}

export type ExtractedNote = {
  title: string
  content: string
  companyName: string
}

export type DocumentAnalysis = {
  companies: ExtractedCompany[]
  contacts: ExtractedContact[]
  notes: ExtractedNote[]
  summary: string
}

export async function analyzeDocument(content: string, fileName: string, fileType: string): Promise<DocumentAnalysis> {
  const excerpt = content.slice(0, 8000)

  const prompt = `Analyse ce document professionnel et extrais toutes les informations structurées. Réponds UNIQUEMENT en JSON avec cette structure exacte :
{
  "companies": [{
    "name": string,
    "city": string | null,
    "sector": string | null,
    "status": "client" | "prospect" | null,
    "phone": string | null,
    "website": string | null,
    "revenue": string | null,
    "description": string | null
  }],
  "contacts": [{
    "firstName": string,
    "lastName": string,
    "email": string | null,
    "phone": string | null,
    "position": string | null,
    "companyName": string
  }],
  "notes": [{
    "title": string,
    "content": string,
    "companyName": string
  }],
  "summary": string
}

Si plusieurs entreprises sont mentionnées, liste-les toutes. Si aucune information n'est trouvée pour un champ, mets null. Ne pas inventer d'informations.

Fichier : ${fileName} (${fileType})

Contenu :
${excerpt}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  try {
    const result = JSON.parse(cleaned)
    return {
      companies: Array.isArray(result.companies) ? result.companies : [],
      contacts: Array.isArray(result.contacts) ? result.contacts : [],
      notes: Array.isArray(result.notes) ? result.notes : [],
      summary: typeof result.summary === 'string' ? result.summary : '',
    }
  } catch {
    return { companies: [], contacts: [], notes: [], summary: '' }
  }
}

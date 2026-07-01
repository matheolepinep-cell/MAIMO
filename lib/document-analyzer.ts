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
  const empty: DocumentAnalysis = { companies: [], contacts: [], notes: [], summary: '' }

  try {
    const excerpt = content.slice(0, 8000)
    console.log('[analyzeDocument] starting, excerpt length:', excerpt.length, 'file:', fileName)

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
      const analysis: DocumentAnalysis = {
        companies: Array.isArray(result.companies) ? result.companies : [],
        contacts: Array.isArray(result.contacts) ? result.contacts : [],
        notes: Array.isArray(result.notes) ? result.notes : [],
        summary: typeof result.summary === 'string' ? result.summary : '',
      }
      console.log('[analyzeDocument] done — companies:', analysis.companies.length, 'contacts:', analysis.contacts.length, 'notes:', analysis.notes.length)
      return analysis
    } catch (parseErr) {
      console.error('[analyzeDocument] JSON parse error, raw response:', raw.substring(0, 200), parseErr)
      return empty
    }
  } catch (err) {
    console.error('[analyzeDocument] Anthropic API error:', err)
    return empty
  }
}

/* ─── Account-level document analysis ─── */

export type DetectedActionType = 'index' | 'create_contact' | 'create_note' | 'move_folder'

export type DetectedAction =
  | { type: 'index'; label: string }
  | { type: 'create_contact'; label: string; firstName: string; lastName: string; email: string | null; phone: string | null; position: string | null }
  | { type: 'create_note'; label: string; title: string; content: string }
  | { type: 'move_folder'; label: string; folderId: string; folderName: string }

export type AccountAnalysisResult = {
  summary: string
  actions: DetectedAction[]
  suggestedFolderId: string | null
}

export async function analyzeAccountDocument(params: {
  content: string
  fileName: string
  accountName: string
  existingFolders: Array<{ id: string; name: string }>
  existingContacts: Array<{ name: string }>
}): Promise<AccountAnalysisResult> {
  const { content, fileName, accountName, existingFolders, existingContacts } = params
  const excerpt = content.slice(0, 8000)

  const folderList = existingFolders.map((f) => `- id: ${f.id}, name: "${f.name}"`).join('\n') || 'Aucun dossier existant'
  const contactList = existingContacts.map((c) => `- ${c.name}`).join('\n') || 'Aucun contact existant'

  const prompt = `Tu analyses un document appartenant au client "${accountName}".

Fichier : ${fileName}

Dossiers existants pour ce client :
${folderList}

Contacts déjà connus pour ce client :
${contactList}

Contenu du document :
${excerpt}

Réponds UNIQUEMENT en JSON avec cette structure :
{
  "summary": string (2-3 phrases résumant le document),
  "contacts": [{ "firstName": string, "lastName": string, "email": string|null, "phone": string|null, "position": string|null }],
  "notes": [{ "title": string, "content": string }],
  "suggestedFolderId": string|null (id d'un dossier existant si le document y appartient clairement, sinon null)
}

Règles :
- Ne propose des contacts que s'ils ne sont PAS déjà dans la liste des contacts connus.
- Ne propose des notes que si le document contient des informations clés à retenir.
- Pour suggestedFolderId, utilise uniquement des ids de la liste ci-dessus ou null.
- Ne pas inventer d'informations.`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  try {
    const result = JSON.parse(cleaned)
    const actions: DetectedAction[] = []

    // Index action always offered
    actions.push({ type: 'index', label: 'Indexer pour la recherche IA' })

    // Contacts
    const contacts: Array<{ firstName: string; lastName: string; email: string | null; phone: string | null; position: string | null }> =
      Array.isArray(result.contacts) ? result.contacts : []
    for (const c of contacts) {
      if (c.firstName && c.lastName) {
        actions.push({
          type: 'create_contact',
          label: `Créer contact : ${c.firstName} ${c.lastName}${c.position ? ` (${c.position})` : ''}`,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email ?? null,
          phone: c.phone ?? null,
          position: c.position ?? null,
        })
      }
    }

    // Notes
    const notes: Array<{ title: string; content: string }> = Array.isArray(result.notes) ? result.notes : []
    for (const n of notes) {
      if (n.title && n.content) {
        actions.push({
          type: 'create_note',
          label: `Créer note : ${n.title}`,
          title: n.title,
          content: n.content,
        })
      }
    }

    // Folder suggestion
    const suggestedFolderId = typeof result.suggestedFolderId === 'string' ? result.suggestedFolderId : null
    if (suggestedFolderId) {
      const folder = existingFolders.find((f) => f.id === suggestedFolderId)
      if (folder) {
        actions.push({
          type: 'move_folder',
          label: `Déplacer vers : ${folder.name}`,
          folderId: folder.id,
          folderName: folder.name,
        })
      }
    }

    return {
      summary: typeof result.summary === 'string' ? result.summary : '',
      actions,
      suggestedFolderId,
    }
  } catch {
    return {
      summary: '',
      actions: [{ type: 'index', label: 'Indexer pour la recherche IA' }],
      suggestedFolderId: null,
    }
  }
}

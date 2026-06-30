import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { env } from './env'

function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRole)
}

export async function generateActivitySummary(
  logId: string,
  resourceId: string,
  action: 'note.created' | 'document.uploaded',
): Promise<void> {
  try {
    const supabase = createAdminClient()

    let textToSummarize: string | null = null

    if (action === 'note.created') {
      const { data: note } = await supabase
        .from('notes')
        .select('content')
        .eq('id', resourceId)
        .single()
      textToSummarize = note?.content ?? null
    } else if (action === 'document.uploaded') {
      const { data: doc } = await supabase
        .from('documents')
        .select('file_name, title')
        .eq('id', resourceId)
        .single()
      textToSummarize = doc?.title ?? doc?.file_name ?? null
    }

    if (!textToSummarize) return

    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

    const prompt = action === 'note.created'
      ? `Résume cette note commerciale en 1 phrase très courte et synthétique (max 15 mots), style professionnel, sans majuscule au début. Note : "${textToSummarize.substring(0, 500)}"`
      : `Décris ce document en 1 phrase très courte (max 10 mots). Nom : "${textToSummarize}"`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = response.content[0].type === 'text'
      ? response.content[0].text.trim().replace(/^["']|["']$/g, '')
      : null

    if (!summary) return

    const { data: log } = await supabase
      .from('audit_logs')
      .select('metadata')
      .eq('id', logId)
      .single()

    await supabase
      .from('audit_logs')
      .update({ metadata: { ...(log?.metadata ?? {}), ai_summary: summary } })
      .eq('id', logId)
  } catch {
    // Never block the main action
  }
}

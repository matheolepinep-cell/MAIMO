import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey })

const ACTION_KEYWORDS = ['rappel', 'relancer', 'rdv', 'réunion', 'envoyer', 'appeler', 'suivre', 'contacter', 'relance']

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { company_id, workspace_id, first_name } = await request.json()
  if (!company_id || company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const wf = workspace_id ? `workspace_id.eq.${workspace_id},workspace_id.is.null` : null
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000).toISOString()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  // 1. Accounts with no note in the last 30 days
  let accountsQ = supabase.from('accounts').select('id, name, created_at').eq('company_id', company_id)
  if (wf) accountsQ = accountsQ.or(wf)
  const { data: allAccounts } = await accountsQ

  let recentNotesForAccountsQ = supabase.from('notes')
    .select('account_id')
    .eq('company_id', company_id)
    .eq('is_deleted', false)
    .gte('created_at', thirtyDaysAgo)
  if (wf) recentNotesForAccountsQ = recentNotesForAccountsQ.or(wf)
  const { data: recentNoteAccounts } = await recentNotesForAccountsQ

  const activeAccountIds = new Set((recentNoteAccounts ?? []).map((n) => n.account_id))
  const staleAccounts = (allAccounts ?? [])
    .filter((a) => !activeAccountIds.has(a.id))
    .slice(0, 5)
    .map((a) => {
      const daysSince = Math.floor((today.getTime() - new Date(a.created_at).getTime()) / (1000 * 3600 * 24))
      return { name: a.name, days: daysSince }
    })

  const totalAccounts = (allAccounts ?? []).length
  const staleCount = staleAccounts.length

  // 2. Recent notes with action keywords
  let actionNotesQ = supabase.from('notes')
    .select('id, title, content, account_id, created_at')
    .eq('company_id', company_id)
    .eq('is_deleted', false)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(50)
  if (wf) actionNotesQ = actionNotesQ.or(wf)
  const { data: recentNotes } = await actionNotesQ

  const actionNotes = (recentNotes ?? []).filter((n) => {
    const text = `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase()
    return ACTION_KEYWORDS.some((kw) => text.includes(kw))
  }).slice(0, 5)

  const actionAccountIds = [...new Set(actionNotes.map((n) => n.account_id))]
  let accountNamesData: { id: string; name: string }[] = []
  if (actionAccountIds.length > 0) {
    const { data } = await supabase.from('accounts').select('id, name').in('id', actionAccountIds)
    accountNamesData = data ?? []
  }
  const accNameMap = Object.fromEntries(accountNamesData.map((a) => [a.id, a.name]))

  const actionItems = actionNotes.map((n) => ({
    account: accNameMap[n.account_id] ?? '—',
    excerpt: (n.title ?? n.content ?? '').slice(0, 60),
    date: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(n.created_at)),
  }))

  // 3. Team activity today
  const { data: todayNotes } = await supabase.from('notes')
    .select('id, user_id, users(full_name)')
    .eq('company_id', company_id)
    .eq('is_deleted', false)
    .gte('created_at', startOfToday)

  type NoteRow = { id: string; user_id: string; users: { full_name: string } | null }
  const teamActivity = Object.values(
    ((todayNotes ?? []) as unknown as NoteRow[]).reduce((acc, n) => {
      const name = n.users?.full_name ?? 'Inconnu'
      if (!acc[n.user_id]) acc[n.user_id] = { name, count: 0 }
      acc[n.user_id].count++
      return acc
    }, {} as Record<string, { name: string; count: number }>)
  ).slice(0, 3)

  // Build prompt data
  const dataLines: string[] = []
  if (actionItems.length > 0) {
    dataLines.push(`Rappels/RDV détectés : ${actionItems.map((i) => `${i.account} — "${i.excerpt}" (${i.date})`).join(' | ')}`)
  }
  if (staleAccounts.length > 0) {
    dataLines.push(`Clients sans contact récent : ${staleAccounts.map((a) => `${a.name} (${a.days}j)`).join(', ')}`)
  }
  if (teamActivity.length > 0) {
    dataLines.push(`Activité équipe aujourd'hui : ${teamActivity.map((t) => `${t.name} (${t.count} note${t.count > 1 ? 's' : ''})`).join(', ')}`)
  }
  if (dataLines.length === 0) {
    dataLines.push(`Portefeuille : ${totalAccounts} entreprise${totalAccounts > 1 ? 's' : ''} au total`)
  }

  const prompt = `Tu es l'assistant commercial de ${first_name || 'l\'utilisateur'}. Donne exactement 3 informations urgentes et actionnables parmi les données disponibles. Priorise dans cet ordre : 1) les rappels et RDV détectés dans les notes récentes, 2) les clients sans contact depuis longtemps, 3) les documents non classés. Si une catégorie manque de données, génère quand même un item pertinent à partir des données disponibles. Chaque item = 1 phrase, 8 mots maximum, directe et sans verbe d'introduction. Réponds uniquement en JSON : { "items": [string, string, string] }. Pas de markdown, pas d'intro.\n\nDonnées disponibles :\n${dataLines.join('\n')}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const clean = raw.replace(/```json|```/g, '').trim()

  let items: string[] = []
  try {
    const parsed = JSON.parse(clean)
    items = Array.isArray(parsed.items) ? parsed.items.map(String).slice(0, 3) : []
  } catch {
    // Fallback: parse line by line if Claude didn't respect JSON
    items = clean
      .split('\n')
      .map((l) => l.replace(/^[-•·*\d."{}[\]]+\s*/, '').trim())
      .filter((l) => l.length > 4 && !l.startsWith('"items"') && !l.startsWith('{') && !l.startsWith('}'))
      .slice(0, 3)
  }

  return NextResponse.json({ items, stale_count: staleCount, total_accounts: totalAccounts })
}

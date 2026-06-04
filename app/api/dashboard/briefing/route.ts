import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ACTION_KEYWORDS = ['rappel', 'relancer', 'rdv', 'réunion', 'réunion', 'envoyer', 'appeler', 'suivre', 'contacter', 'relance']

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { company_id, workspace_id, first_name } = await request.json()
  if (!company_id || company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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

  if (staleAccounts.length > 0) {
    dataLines.push(`Entreprises sans contact récent : ${staleAccounts.map((a) => `${a.name} (${a.days}j)`).join(', ')}`)
  }
  if (actionItems.length > 0) {
    dataLines.push(`Notes avec actions à faire : ${actionItems.map((i) => `${i.account} — "${i.excerpt}" (${i.date})`).join(' | ')}`)
  }
  if (teamActivity.length > 0) {
    dataLines.push(`Activité équipe aujourd'hui : ${teamActivity.map((t) => `${t.name} (${t.count} note${t.count > 1 ? 's' : ''})`).join(', ')}`)
  }

  if (dataLines.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const prompt = `Tu es l'assistant commercial de ${first_name || 'l\'utilisateur'}. Génère un briefing du matin ultra-concis en 2 à 3 points maximum. Chaque point = 1 ligne, 10 mots max. Pas d'introduction, pas de conclusion. Commence directement par les points. Format : une phrase courte et actionnable par ligne. Exemples de style : 'Bénéteau sans contact depuis 45 jours' / 'RDV Alpine à confirmer — note du 2 juin' / '3 documents non classés en attente'. Données disponibles :\n${dataLines.join('\n')}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const items = raw
    .split('\n')
    .map((l) => l.replace(/^[-•·*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 3)

  return NextResponse.json({ items })
}

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const REDIRECT_URI = 'https://www.maimoo.fr/api/auth/google/callback'

type GoogAuthClient = InstanceType<typeof google.auth.OAuth2>

function makeClient(): GoogAuthClient {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getGoogleClient(userId: string): Promise<GoogAuthClient | null> {
  const supabase = adminSupabase()
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('google_access_token, google_refresh_token, google_token_expiry, google_calendar_connected')
    .eq('id', userId)
    .single()

  if (profileError) {
    console.error('[GOOGLE] getGoogleClient — erreur lecture users:', profileError.message)
    return null
  }

  console.log('[GOOGLE] userId:', userId)
  console.log('[GOOGLE] google_calendar_connected:', profile?.google_calendar_connected)
  console.log('[GOOGLE] access_token présent:', !!profile?.google_access_token)
  console.log('[GOOGLE] refresh_token présent:', !!profile?.google_refresh_token)

  if (!profile?.google_calendar_connected || !profile.google_access_token) return null

  const client = makeClient()
  client.setCredentials({
    access_token: profile.google_access_token,
    refresh_token: profile.google_refresh_token ?? undefined,
  })

  // Refresh if expired or expiring within 60s
  const expiry = profile.google_token_expiry ? new Date(profile.google_token_expiry).getTime() : 0
  const needsRefresh = expiry < Date.now() + 60_000
  console.log('[GOOGLE] token expiré ou expirant bientôt:', needsRefresh, '— expiry:', profile.google_token_expiry)

  if (needsRefresh) {
    if (!profile.google_refresh_token) {
      console.error('[GOOGLE] pas de refresh_token — impossible de rafraîchir')
      return null
    }
    try {
      const { credentials } = await client.refreshAccessToken()
      client.setCredentials(credentials)
      await supabase.from('users').update({
        google_access_token: credentials.access_token,
        google_token_expiry: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      }).eq('id', userId)
      console.log('[GOOGLE] token rafraîchi avec succès')
    } catch (e) {
      console.error('[GOOGLE] échec refresh token:', e)
      return null
    }
  }

  return client
}

export type CalendarEvent = {
  id?: string
  google_event_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string
  location: string | null
  attendees: { email: string; name?: string }[]
  company_id: string | null
  synced_from: string
}

export async function syncCalendarEvents(
  userId: string,
  workspaceId: string | null
): Promise<{ synced: number; updated: number; error?: string }> {
  console.log('[SYNC] démarrage pour userId:', userId, '— workspaceId:', workspaceId)

  const auth = await getGoogleClient(userId)
  if (!auth) {
    console.warn('[SYNC] pas de client Google — abandon')
    return { synced: 0, updated: 0, error: 'no_auth' }
  }

  const calendar = google.calendar({ version: 'v3', auth })
  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000)

  let items: { id?: string | null; summary?: string | null; start?: { dateTime?: string | null; date?: string | null } | null; end?: { dateTime?: string | null; date?: string | null } | null; attendees?: { email?: string | null; displayName?: string | null }[] | null; description?: string | null; location?: string | null }[] = []
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: in7Days.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })
    items = res.data.items ?? []
    console.log('[SYNC] événements Google reçus:', items.length)
  } catch (e) {
    console.error('[SYNC] erreur appel Google Calendar API:', e)
    return { synced: 0, updated: 0, error: String(e) }
  }

  if (items.length === 0) return { synced: 0, updated: 0 }

  const supabase = adminSupabase()

  // Load accounts for fuzzy matching
  const { data: accounts } = await supabase.from('accounts').select('id, name')

  // Load contacts for email matching
  const { data: contacts } = await supabase.from('contacts').select('account_id, email')

  const emailToAccount: Record<string, string> = {}
  for (const c of contacts ?? []) {
    if (c.email) emailToAccount[c.email.toLowerCase()] = c.account_id
  }

  function findCompanyId(event: (typeof items)[0]): string | null {
    const attendeeEmails = (event.attendees ?? []).map((a: { email?: string | null }) => (a.email ?? '').toLowerCase())
    for (const email of attendeeEmails) {
      if (emailToAccount[email]) return emailToAccount[email]
    }
    const title = (event.summary ?? '').toLowerCase()
    for (const acc of accounts ?? []) {
      if (acc.name && title.includes(acc.name.toLowerCase())) return acc.id
    }
    return null
  }

  let synced = 0
  let updated = 0

  for (const item of items) {
    if (!item.summary || !item.start || !item.end) continue

    const startTime = item.start.dateTime ?? item.start.date ?? ''
    const endTime = item.end.dateTime ?? item.end.date ?? ''
    if (!startTime || !endTime) continue

    const companyId = findCompanyId(item)
    const attendees = (item.attendees ?? []).map((a: { email?: string | null; displayName?: string | null }) => ({
      email: a.email ?? '',
      name: a.displayName ?? '',
    }))

    const row = {
      user_id: userId,
      workspace_id: workspaceId,
      google_event_id: item.id ?? null,
      title: item.summary,
      description: item.description ?? null,
      start_time: startTime,
      end_time: endTime,
      location: item.location ?? null,
      attendees,
      company_id: companyId,
      synced_from: 'google',
      updated_at: new Date().toISOString(),
    }

    const { data: existing, error: selectError } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('google_event_id', item.id!)
      .eq('user_id', userId)
      .maybeSingle()

    if (selectError) {
      console.error('[SYNC] erreur lecture calendar_events (table existe?):', selectError.message)
      return { synced: 0, updated: 0, error: selectError.message }
    }

    if (existing) {
      const { error: updErr } = await supabase.from('calendar_events').update(row).eq('id', existing.id)
      if (updErr) console.error('[SYNC] erreur update:', updErr.message)
      else updated++
    } else {
      const { error: insErr } = await supabase.from('calendar_events').insert({ ...row, created_at: new Date().toISOString() })
      if (insErr) console.error('[SYNC] erreur insert:', insErr.message)
      else synced++
    }
  }

  console.log('[SYNC] terminé — synced:', synced, 'updated:', updated)
  return { synced, updated }
}

export async function createGoogleEvent(
  userId: string,
  eventData: {
    title: string
    description?: string
    startTime: string
    endTime: string
    location?: string
    attendeeEmails?: string[]
    workspaceId?: string | null
    companyId?: string | null
  }
): Promise<CalendarEvent | null> {
  const auth = await getGoogleClient(userId)
  if (!auth) return null

  const calendar = google.calendar({ version: 'v3', auth })

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: eventData.title,
      description: eventData.description,
      start: { dateTime: eventData.startTime },
      end: { dateTime: eventData.endTime },
      location: eventData.location,
      attendees: eventData.attendeeEmails?.map((email) => ({ email })),
    },
  })

  const googleId = event.data.id ?? null
  const supabase = adminSupabase()

  const row: Omit<CalendarEvent, 'id'> & { user_id: string; workspace_id?: string | null; created_at: string; updated_at: string } = {
    user_id: userId,
    workspace_id: eventData.workspaceId ?? null,
    google_event_id: googleId,
    title: eventData.title,
    description: eventData.description ?? null,
    start_time: eventData.startTime,
    end_time: eventData.endTime,
    location: eventData.location ?? null,
    attendees: eventData.attendeeEmails?.map((e) => ({ email: e })) ?? [],
    company_id: eventData.companyId ?? null,
    synced_from: 'maimoo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data } = await supabase.from('calendar_events').insert(row).select().single()
  return data as CalendarEvent
}

export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string
): Promise<void> {
  const auth = await getGoogleClient(userId)
  if (auth) {
    try {
      const calendar = google.calendar({ version: 'v3', auth })
      await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId })
    } catch {
      // Continue even if Google delete fails
    }
  }

  const supabase = adminSupabase()
  await supabase
    .from('calendar_events')
    .delete()
    .eq('google_event_id', googleEventId)
    .eq('user_id', userId)
}

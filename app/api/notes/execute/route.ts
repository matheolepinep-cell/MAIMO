import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { normalizeText, levenshtein } from '@/lib/search-utils'
import { createGoogleEvent } from '@/lib/google-calendar'

interface CreateCompanyAction { type: 'create_company'; company_name?: string; city?: string; sector?: string; status?: string }
interface CreateContactAction { type: 'create_contact'; first_name?: string; last_name?: string; position?: string; email?: string; phone?: string; company_name?: string }
interface CreateNoteAction { type: 'create_note'; content?: string; company_name?: string }
interface CreateCalendarEventAction { type: 'create_calendar_event'; title?: string; date?: string; start_time?: string; end_time?: string; company_name?: string; enabled?: boolean }
type Action = CreateCompanyAction | CreateContactAction | CreateNoteAction | CreateCalendarEventAction

type ResolvedCompany = { id: string; name: string; created: boolean }

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ',France')}&format=json&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'Maimoo/1.0' } })
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actions, workspaceId, companyId, source } = await request.json()

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Load all accounts once for fuzzy dedup throughout this request
  const { data: allAccountsData } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', user.company_id)

  const allAccounts: { id: string; name: string }[] = allAccountsData ?? []

  const findAccount = (name: string): { id: string; name: string } | null => {
    const norm = normalizeText(name.trim())
    for (const acc of allAccounts) {
      const n = normalizeText(acc.name)
      if (n === norm || n.includes(norm) || norm.includes(n) || (norm.length >= 4 && levenshtein(n, norm) <= 2)) {
        return acc
      }
    }
    return null
  }

  const addToPortfolio = async (accountId: string) => {
    const payload: Record<string, unknown> = {
      user_id: user.id,
      account_id: accountId,
      company_id: user.company_id,
      visibility: 'private',
      workspace_id: workspaceId ?? null,
    }
    const { data: existing } = await supabase.from('portfolio').select('id').eq('user_id', user.id).eq('account_id', accountId).maybeSingle()
    if (!existing) await supabase.from('portfolio').insert(payload)
  }

  // Auto-create an account when company_name is known but not found in workspace
  const autoCreateAccount = async (name: string): Promise<{ id: string; name: string } | null> => {
    const payload: Record<string, unknown> = {
      company_id: user.company_id,
      name: name.trim(),
      status: 'prospect',
      created_by: user.id,
    }
    if (workspaceId) payload.workspace_id = workspaceId
    const { data: created } = await supabase.from('accounts').insert(payload).select().single()
    if (!created) return null
    const c = created as { id: string; name: string }
    allAccounts.push(c)
    results.push({ type: 'create_company', companyId: c.id, companyName: c.name, created: true })
    summary.push(`Fiche ${c.name} créée`)
    resolvedCompanies[normalizeText(c.name)] = { id: c.id, name: c.name, created: true }
    await addToPortfolio(c.id)
    return c
  }

  const resolvedCompanies: Record<string, ResolvedCompany> = {}
  const results: Record<string, unknown>[] = []
  const summary: string[] = []

  for (const action of ((actions ?? []) as Action[])) {

    /* ── create_company ── */
    if (action.type === 'create_company') {
      const targetName = (action.company_name ?? '').trim()
      if (!targetName) continue

      const normTarget = normalizeText(targetName)
      const existing = findAccount(targetName)

      if (existing) {
        resolvedCompanies[normTarget] = { id: existing.id, name: existing.name, created: false }
        results.push({ type: 'create_company', companyId: existing.id, companyName: existing.name, created: false })
        summary.push(`${existing.name} existe déjà`)
      } else {
        const payload: Record<string, unknown> = {
          company_id: user.company_id,
          name: targetName,
          city: action.city ?? null,
          industry: action.sector ?? null,
          status: action.status ?? 'prospect',
          created_by: user.id,
        }
        if (workspaceId) payload.workspace_id = workspaceId

        const { data: created } = await supabase.from('accounts').insert(payload).select().single()
        if (created) {
          const c = created as { id: string; name: string }
          resolvedCompanies[normTarget] = { id: c.id, name: c.name, created: true }
          results.push({ type: 'create_company', companyId: c.id, companyName: c.name, created: true })
          summary.push(`Fiche ${c.name} créée`)
          allAccounts.push(c)

          await addToPortfolio(c.id)

          if (action.city) {
            geocodeCity(action.city).then((coords) => {
              if (coords) supabase.from('accounts').update({ lat: coords.lat, lng: coords.lng }).eq('id', c.id).then(() => {})
            }).catch(() => {})
          }
        }
      }
    }

    /* ── create_contact ── */
    else if (action.type === 'create_contact') {
      const firstName = (action.first_name ?? '').trim()
      const lastName = (action.last_name ?? '').trim()
      if (!firstName && !lastName) continue

      let accountId: string | null = companyId ?? null

      const contactCompanyName = (action.company_name ?? '').trim()
      if (contactCompanyName) {
        const normName = normalizeText(contactCompanyName)
        if (resolvedCompanies[normName]) {
          accountId = resolvedCompanies[normName].id
        } else {
          const found = findAccount(contactCompanyName)
          if (found) {
            accountId = found.id
          } else {
            // Company not found → auto-create it
            const autoCreated = await autoCreateAccount(contactCompanyName)
            if (autoCreated) accountId = autoCreated.id
          }
        }
      }

      // Dedup: same first+last in same account
      let existQ = supabase.from('contacts').select('id').eq('company_id', user.company_id)
      if (accountId) existQ = existQ.eq('account_id', accountId)
      if (firstName) existQ = existQ.ilike('first_name', firstName)
      if (lastName) existQ = existQ.ilike('last_name', lastName)
      const { data: existingContact } = await existQ.maybeSingle()

      const fullName = [firstName, lastName].filter(Boolean).join(' ')

      if (existingContact) {
        results.push({ type: 'create_contact', contactId: (existingContact as { id: string }).id, contactName: fullName, created: false, accountId })
        summary.push(`${fullName} existe déjà`)
      } else {
        const payload: Record<string, unknown> = {
          company_id: user.company_id,
          account_id: accountId,
          first_name: firstName || null,
          last_name: lastName || null,
          role: action.position ?? null,
          email: action.email ?? null,
          phone: action.phone ?? null,
        }

        const { data: created } = await supabase.from('contacts').insert(payload).select().single()
        if (created) {
          results.push({ type: 'create_contact', contactId: (created as { id: string }).id, contactName: fullName, created: true, accountId })
          summary.push(`Contact ${fullName} ajouté`)
        }
      }
    }

    /* ── create_calendar_event ── */
    else if (action.type === 'create_calendar_event') {
      if (action.enabled === false) continue
      const title = (action.title ?? '').trim()
      const date = (action.date ?? '').trim()
      const startTime = (action.start_time ?? '09:00').trim()
      const endTime = (action.end_time ?? '10:00').trim()
      if (!title || !date) continue

      const startISO = `${date}T${startTime}:00`
      const endISO = `${date}T${endTime}:00`

      let calAccountId: string | null = companyId ?? null
      const calCompanyName = (action.company_name ?? '').trim()
      if (calCompanyName) {
        const found = findAccount(calCompanyName)
        if (found) calAccountId = found.id
      }

      const calEvent = await createGoogleEvent(user.id, {
        title,
        startTime: startISO,
        endTime: endISO,
        workspaceId: workspaceId ?? null,
        companyId: calAccountId,
      })

      if (calEvent) {
        results.push({ type: 'create_calendar_event', eventCreated: true, googleEventId: calEvent.google_event_id })
        summary.push(`RDV "${title}" ajouté au calendrier`)
      }
    }

    /* ── create_note ── */
    else if (action.type === 'create_note') {
      const content = (action.content ?? '').trim()
      if (!content) continue

      let accountId: string | null = companyId ?? null
      let accountName: string | null = null

      const noteCompanyName = (action.company_name ?? '').trim()
      if (noteCompanyName) {
        const normName = normalizeText(noteCompanyName)
        if (resolvedCompanies[normName]) {
          accountId = resolvedCompanies[normName].id
          accountName = resolvedCompanies[normName].name
        } else {
          const found = findAccount(noteCompanyName)
          if (found) {
            accountId = found.id
            accountName = found.name
          } else {
            // Company not found → auto-create it
            const autoCreated = await autoCreateAccount(noteCompanyName)
            if (autoCreated) { accountId = autoCreated.id; accountName = autoCreated.name }
          }
        }
      }

      if (!accountName && accountId) {
        const { data: acc } = await supabase.from('accounts').select('name').eq('id', accountId).single()
        accountName = acc?.name ?? null
      }

      const today = new Date().toLocaleDateString('fr-FR')
      const title = `Note du ${today}${accountName ? ` — ${accountName}` : ''}`

      const notePayload: Record<string, unknown> = {
        account_id: accountId,
        company_id: user.company_id,
        user_id: user.id,
        title,
        content,
        source: source ?? 'vocal',
        is_deleted: false,
      }
      if (workspaceId) notePayload.workspace_id = workspaceId

      const { data: created } = await supabase.from('notes').insert(notePayload).select().single()
      if (created) {
        const c = created as { id: string }
        results.push({ type: 'create_note', noteId: c.id, accountId, created: true })
        summary.push('Note enregistrée')

        // Fire-and-forget RAG indexing (forward auth cookies)
        const host = request.headers.get('host') ?? 'localhost:3000'
        const proto = host.includes('localhost') ? 'http' : 'https'
        fetch(`${proto}://${host}/api/index-note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
          body: JSON.stringify({ note_id: c.id, content, account_id: accountId, company_id: user.company_id, workspace_id: workspaceId ?? null }),
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ results, summary })
}

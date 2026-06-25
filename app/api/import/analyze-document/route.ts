import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzeDocument } from '@/lib/document-analyzer'
import { normalizeText, levenshtein } from '@/lib/search-utils'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'
import type { UserProfile } from '@/types/database'

type AccountRow = {
  id: string
  name: string
  phone: string | null
  website: string | null
  industry: string | null
  revenue: string | null
  description: string | null
  city: string | null
}

function normalizeName(name: string): string {
  return normalizeText(name)
    .replace(/sas|sarl|eurl|sasu|earl|snc|sci/g, '')
}

function findMatchingAccount(name: string, accounts: AccountRow[]): AccountRow | null {
  const norm = normalizeName(name)
  if (norm.length < 2) return null
  for (const acc of accounts) {
    const accNorm = normalizeName(acc.name)
    if (norm === accNorm) return acc
    if (accNorm.length >= 4 && (norm.includes(accNorm) || accNorm.includes(norm))) return acc
    if (norm.length >= 5 && accNorm.length >= 5 && levenshtein(norm, accNorm) <= 2) return acc
  }
  return null
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { limited } = await checkRateLimit(user.id, '/api/import/analyze-document')
  if (limited) {
    return NextResponse.json(
      { error: 'Limite quotidienne atteinte (20 analyses/jour). Réessayez demain.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  const { text, file_path, file_name, file_type, company_id, workspace_id } = await request.json()

  if (!text || !file_path || !file_name || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const analysis = await analyzeDocument(text, file_name, file_type)

  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('id, name, phone, website, industry, revenue, description, city')
    .eq('company_id', company_id)

  const accountsArr: AccountRow[] = existingAccounts ?? []

  const companyAccountMap = new Map<string, string>()
  const companiesCreated: string[] = []
  const companiesUpdated: { name: string; fieldsAdded: number }[] = []
  let firstAccountId: string | null = null
  let firstCompanyName: string | null = null

  // ── Process companies ───────────────────────────────────────────────────────
  for (const comp of analysis.companies) {
    const compName = comp.name?.trim()
    if (!compName) continue

    const existing = findMatchingAccount(compName, accountsArr)

    if (existing) {
      companyAccountMap.set(compName, existing.id)
      if (!firstAccountId) { firstAccountId = existing.id; firstCompanyName = existing.name }

      // ÉTAPE 4 — fill empty fields only
      const updates: Record<string, string> = {}
      if (!existing.phone && comp.phone) updates.phone = comp.phone
      if (!existing.website && comp.website) updates.website = comp.website
      if (!existing.industry && comp.sector) updates.industry = comp.sector
      if (!existing.revenue && comp.revenue) updates.revenue = comp.revenue
      if (!existing.description && comp.description) updates.description = comp.description
      if (!existing.city && comp.city) updates.city = comp.city

      if (Object.keys(updates).length > 0) {
        await supabase.from('accounts').update(updates).eq('id', existing.id)
        companiesUpdated.push({ name: existing.name, fieldsAdded: Object.keys(updates).length })
        Object.assign(existing, updates)
      }
    } else {
      const { data: acc } = await supabase
        .from('accounts')
        .insert({
          name: compName,
          city: comp.city ?? null,
          industry: comp.sector ?? null,
          status: comp.status ?? 'prospect',
          phone: comp.phone ?? null,
          website: comp.website ?? null,
          revenue: comp.revenue ?? null,
          description: comp.description ?? null,
          company_id,
          created_by: user.id,
          workspace_id: workspace_id ?? null,
        })
        .select('id')
        .single()

      if (acc) {
        companyAccountMap.set(compName, acc.id)
        if (!firstAccountId) { firstAccountId = acc.id; firstCompanyName = compName }
        companiesCreated.push(compName)
        accountsArr.push({ id: acc.id, name: compName, phone: comp.phone ?? null, website: comp.website ?? null, industry: comp.sector ?? null, revenue: comp.revenue ?? null, description: comp.description ?? null, city: comp.city ?? null })

        await supabase.from('portfolio').upsert(
          { user_id: user.id, account_id: acc.id, company_id, visibility: 'team', workspace_id: workspace_id ?? null },
          { onConflict: 'user_id,account_id' }
        )
      }
    }
  }

  // ── Process contacts ────────────────────────────────────────────────────────
  const contactsCreated: string[] = []
  for (const contact of analysis.contacts) {
    const accountId =
      companyAccountMap.get(contact.companyName) ??
      findMatchingAccount(contact.companyName, accountsArr)?.id ??
      firstAccountId
    if (!accountId) continue

    const { data: existing } = await supabase
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('account_id', accountId)

    const normNew = normalizeText(`${contact.firstName} ${contact.lastName}`)
    const isDup = (existing ?? []).some((c) => {
      const normC = normalizeText(`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim())
      const emailMatch = contact.email && c.email && c.email.toLowerCase() === contact.email.toLowerCase()
      return normC === normNew || emailMatch
    })

    if (!isDup) {
      await supabase.from('contacts').insert({
        account_id: accountId,
        first_name: contact.firstName,
        last_name: contact.lastName,
        role: contact.position ?? null,
        phone: contact.phone ?? null,
        email: contact.email ?? null,
        is_main_contact: false,
        company_id,
      })
      contactsCreated.push(`${contact.firstName} ${contact.lastName}`)
    }
  }

  // ── Process notes ───────────────────────────────────────────────────────────
  const authorName = (user as UserProfile).full_name ?? 'Import'
  const noteDate = new Date().toLocaleDateString('fr-FR')
  let notesCreated = 0

  for (const note of analysis.notes) {
    const accountId =
      companyAccountMap.get(note.companyName) ??
      findMatchingAccount(note.companyName, accountsArr)?.id ??
      firstAccountId
    if (!accountId) continue

    const accountName = accountsArr.find((a) => a.id === accountId)?.name ?? 'Inconnu'

    const { data: noteRec } = await supabase
      .from('notes')
      .insert({
        account_id: accountId,
        company_id,
        user_id: user.id,
        title: note.title,
        content: note.content,
        source: 'import',
        is_deleted: false,
        workspace_id: workspace_id ?? null,
      })
      .select('id')
      .single()

    if (noteRec?.id) {
      notesCreated++
      try {
        const rawChunks = chunkText(note.content)
        if (rawChunks.length > 0) {
          const enriched = rawChunks.map(
            (c) => `[Entreprise: ${accountName} | Date: ${noteDate} | Auteur: ${authorName} | Type: Note]\n\n${c}`
          )
          const embeddings = await embedBatch(enriched)
          await supabase.from('chunks').insert(
            enriched.map((c, i) => ({
              company_id,
              account_id: accountId,
              source_type: 'note' as const,
              source_id: noteRec.id,
              content: c,
              embedding: embeddings[i],
              workspace_id: workspace_id ?? null,
              company_name: accountName,
              author_name: authorName,
            }))
          )
        }
      } catch (err) {
        console.error('Note indexing error:', err)
      }
    }
  }

  // ── Create document record + index ──────────────────────────────────────────
  let documentId: string | null = null
  if (firstAccountId) {
    const { data: urlData } = supabase.storage.from('imports').getPublicUrl(file_path)
    const file_url = urlData?.publicUrl ?? file_path
    const ext = file_name.split('.').pop()?.toLowerCase() ?? ''
    const resolvedFileType: 'pdf' | 'docx' | 'xlsx' | 'image' = ['pdf', 'docx', 'xlsx'].includes(ext)
      ? (ext as 'pdf' | 'docx' | 'xlsx')
      : 'image'

    const { data: doc } = await supabase
      .from('documents')
      .insert({
        account_id: firstAccountId,
        company_id,
        user_id: user.id,
        file_name,
        file_url,
        file_type: resolvedFileType,
        title: file_name.replace(/\.[^.]+$/, ''),
        is_deleted: false,
        workspace_id: workspace_id ?? null,
      })
      .select('id')
      .single()

    if (doc) {
      documentId = doc.id
      try {
        const chunks = chunkText(text)
        if (chunks.length > 0) {
          const accountName = accountsArr.find((a) => a.id === firstAccountId)?.name ?? 'Inconnu'
          const displayName = file_name.replace(/\.[^.]+$/, '')
          const enriched = chunks.map(
            (c) => `[Entreprise: ${accountName} | Fichier: ${displayName} | Date: ${noteDate} | Type: Document]\n\n${c}`
          )
          const embeddings = await embedBatch(enriched)
          await supabase.from('chunks').insert(
            enriched.map((c, i) => ({
              company_id,
              account_id: firstAccountId,
              source_type: 'document' as const,
              source_id: doc.id,
              content: c,
              embedding: embeddings[i],
              workspace_id: workspace_id ?? null,
              company_name: accountName,
            }))
          )
        }
      } catch (err) {
        console.error('Document indexing error:', err)
      }
    }
  }

  return NextResponse.json({
    summary: analysis.summary,
    companiesCreated,
    companiesUpdated,
    contactsCreated,
    notesCreated,
    firstAccountId,
    firstCompanyName,
    multipleCompanies: analysis.companies.length > 1,
    documentId,
    needsAccount: !firstAccountId,
  })
}

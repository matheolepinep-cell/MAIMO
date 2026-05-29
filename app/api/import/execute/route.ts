import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

type MaimoField = 'company_name' | 'city' | 'industry' | 'status' | 'contact_name' | 'contact_role' | 'contact_phone' | 'contact_email' | 'revenue' | 'notes'
type PreviewRow = Record<MaimoField, string> & { note_generated: string; _raw: Record<string, unknown> }

function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(sas|sarl|eurl|sasu|earl|snc|sci|sa)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function indexNote(supabase: any, noteId: string, content: string, accountId: string, companyId: string) {
  try {
    const chunks = chunkText(content)
    if (chunks.length === 0) return
    const embeddings = await embedBatch(chunks)
    await supabase.from('chunks').insert(
      chunks.map((chunk: string, i: number) => ({
        company_id: companyId,
        account_id: accountId,
        source_type: 'note',
        source_id: noteId,
        content: chunk,
        embedding: embeddings[i],
      }))
    )
  } catch (err) {
    console.error('Embedding error for note', noteId, err)
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { import_id, selected_indices, company_id, offset = 0, limit = 20 } = await request.json()

  if (!import_id || !selected_indices || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Load rows from DB (read once per batch — not the full list, just metadata)
  const { data: importRecord, error: loadErr } = await supabase
    .from('bulk_imports')
    .select('preview, result')
    .eq('id', import_id)
    .single()

  if (loadErr || !importRecord) {
    return NextResponse.json({ error: 'Import introuvable.' }, { status: 404 })
  }

  const resultData = importRecord.result as { analyzed_rows?: PreviewRow[] } | null
  const previewData = importRecord.preview as { rows?: PreviewRow[] } | null
  const allRows: PreviewRow[] = resultData?.analyzed_rows ?? previewData?.rows ?? []

  // Slice of selected indices for this batch
  const indices = selected_indices as number[]
  const batchIndices = indices.slice(offset, offset + limit)
  const total = indices.length

  // Load existing accounts for dedup (includes accounts created by previous batches)
  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', company_id)

  const existingNorm = new Map<string, string>(
    (existingAccounts ?? []).map((a) => [normalize(a.name), a.id])
  )

  let created = 0
  let merged = 0
  let skipped = 0
  let contactsCreated = 0
  let notesCreated = 0

  const noteDate = new Date().toLocaleDateString('fr-FR')

  for (const idx of batchIndices) {
    const row = allRows[idx]
    if (!row) continue

    const companyName = row.company_name?.trim()
    if (!companyName) { skipped++; continue }

    const normName = normalize(companyName)
    const noteContent = row.note_generated || `Import le ${noteDate}.\nEntreprise : ${companyName}`

    if (existingNorm.has(normName)) {
      // ── MERGE into existing account ──
      const existingId = existingNorm.get(normName)!

      const { data: note } = await supabase.from('notes').insert({
        account_id: existingId,
        company_id,
        user_id: user.id,
        title: `Import — ${noteDate}`,
        content: noteContent,
        source: 'import',
        is_deleted: false,
      }).select('id').single()

      notesCreated++
      if (note?.id) await indexNote(supabase, note.id, noteContent, existingId, company_id)

      await supabase.from('portfolio').upsert({
        company_id,
        user_id: user.id,
        account_id: existingId,
        visibility: 'team',
      }, { onConflict: 'user_id,account_id' })

      if (row.contact_name?.trim()) {
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('first_name, last_name, email')
          .eq('account_id', existingId)

        const normContact = normalize(row.contact_name.trim())
        const isDup = (existingContacts ?? []).some((c) => {
          const cNorm = normalize(`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim())
          const emailMatch = row.contact_email && c.email &&
            c.email.toLowerCase() === row.contact_email.toLowerCase()
          return cNorm === normContact || emailMatch
        })

        if (!isDup) {
          const parts = row.contact_name.trim().split(/\s+/)
          await supabase.from('contacts').insert({
            account_id: existingId,
            first_name: parts[0] ?? '',
            last_name: (parts.slice(1).join(' ') || parts[0]) ?? '',
            role: row.contact_role || null,
            phone: row.contact_phone || null,
            email: row.contact_email || null,
            is_main_contact: false,
            company_id,
          })
          contactsCreated++
        }
      }

      merged++
      continue
    }

    // ── CREATE new account ──
    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .insert({
        name: companyName,
        city: row.city || null,
        industry: row.industry || null,
        status: (row.status === 'client' ? 'client' : 'prospect') as 'client' | 'prospect',
        company_id,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (accErr || !acc) { skipped++; continue }

    existingNorm.set(normName, acc.id)

    await supabase.from('portfolio').upsert({
      user_id: user.id,
      account_id: acc.id,
      company_id,
      visibility: 'team',
    }, { onConflict: 'user_id,account_id' })

    if (row.contact_name?.trim()) {
      const parts = row.contact_name.trim().split(/\s+/)
      await supabase.from('contacts').insert({
        account_id: acc.id,
        first_name: parts[0] ?? '',
        last_name: (parts.slice(1).join(' ') || parts[0]) ?? '',
        role: row.contact_role || null,
        phone: row.contact_phone || null,
        email: row.contact_email || null,
        is_main_contact: true,
        company_id,
      })
      contactsCreated++
    }

    const { data: note } = await supabase.from('notes').insert({
      account_id: acc.id,
      company_id,
      user_id: user.id,
      title: `Import — ${noteDate}`,
      content: noteContent,
      source: 'import',
      is_deleted: false,
    }).select('id').single()

    notesCreated++
    if (note?.id) await indexNote(supabase, note.id, noteContent, acc.id, company_id)

    created++
  }

  const processed = offset + batchIndices.length
  const done = processed >= total

  // Mark done on the last batch
  if (done) {
    await supabase.from('bulk_imports').update({ status: 'done' }).eq('id', import_id)
  }

  return NextResponse.json({
    processed,
    total,
    next_offset: done ? null : processed,
    done,
    created,
    merged,
    skipped,
    contacts_created: contactsCreated,
    notes_created: notesCreated,
  })
}

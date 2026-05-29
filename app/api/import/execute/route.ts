import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

type MaimoField = 'company_name' | 'city' | 'industry' | 'status' | 'contact_name' | 'contact_phone' | 'contact_email' | 'revenue' | 'notes'
type PreviewRow = Record<MaimoField, string> & { note_generated: string; _raw: Record<string, unknown> }

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { import_id, selected_indices, company_id } = await request.json()

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

  // Load bulk_import
  const { data: importRecord, error: loadErr } = await supabase
    .from('bulk_imports')
    .select('preview, mapping, all_rows')
    .eq('id', import_id)
    .single()

  if (loadErr || !importRecord) {
    return NextResponse.json({ error: 'Import introuvable.' }, { status: 404 })
  }

  const preview = importRecord.preview as PreviewRow[]
  const indices = selected_indices as number[]

  // Load existing account names for duplicate detection
  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('company_id', company_id)

  const existingNorm = new Map<string, string>((existingAccounts ?? []).map((a) => [normalize(a.name), a.id]))

  let created = 0
  let skipped = 0
  let contactsCreated = 0
  let notesCreated = 0

  for (const idx of indices) {
    const row = preview[idx]
    if (!row) continue

    const companyName = row.company_name?.trim()
    if (!companyName) { skipped++; continue }

    // Duplicate check
    const normName = normalize(companyName)
    if (existingNorm.has(normName)) { skipped++; continue }

    // Create account
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

    // Create portfolio entry
    await supabase.from('portfolio').insert({
      user_id: user.id,
      account_id: acc.id,
      company_id,
      visibility: 'team',
    })

    // Create contact if present
    if (row.contact_name?.trim()) {
      const nameParts = row.contact_name.trim().split(/\s+/)
      const firstName = nameParts[0] ?? ''
      const lastName = nameParts.slice(1).join(' ') || firstName

      await supabase.from('contacts').insert({
        account_id: acc.id,
        first_name: firstName,
        last_name: lastName,
        phone: row.contact_phone || null,
        email: row.contact_email || null,
        is_main_contact: true,
        company_id,
      })
      contactsCreated++
    }

    // Create note
    const noteDate = new Date().toLocaleDateString('fr-FR')
    const noteContent = row.note_generated || `Fiche importée depuis Excel le ${noteDate}.\nEntreprise : ${companyName}`

    const { data: note } = await supabase.from('notes').insert({
      account_id: acc.id,
      company_id,
      user_id: user.id,
      title: `Import Excel — ${noteDate}`,
      content: noteContent,
      source: 'import',
      is_deleted: false,
    }).select('id').single()

    notesCreated++

    // Index note for RAG
    if (note?.id) {
      try {
        const chunks = chunkText(noteContent)
        if (chunks.length > 0) {
          const embeddings = await embedBatch(chunks)
          const chunkRows = chunks.map((chunk, i) => ({
            company_id,
            account_id: acc.id,
            source_type: 'note' as const,
            source_id: note.id,
            content: chunk,
            embedding: embeddings[i],
          }))
          await supabase.from('chunks').insert(chunkRows)
        }
      } catch (err) {
        console.error('Embedding error for note', note.id, err)
        // Don't fail the import for embedding errors
      }
    }

    created++
  }

  // Update bulk_import status
  await supabase.from('bulk_imports').update({
    status: 'done',
    result: { created, skipped, contacts_created: contactsCreated, notes_created: notesCreated },
  }).eq('id', import_id)

  return NextResponse.json({ created, skipped, contacts_created: contactsCreated, notes_created: notesCreated })
}

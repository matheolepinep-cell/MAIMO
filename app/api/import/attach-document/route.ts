import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, file_path, file_name, file_type, account_id, company_id, workspace_id } = await request.json()

  if (!text || !file_path || !file_name || !account_id || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Build public URL for the file (stored in imports bucket)
  const { data: urlData } = supabase.storage.from('imports').getPublicUrl(file_path)
  const file_url = urlData?.publicUrl ?? file_path

  // Map raw extension to documents.file_type enum ('pdf'|'docx'|'xlsx'|'image')
  const ext = file_name.split('.').pop()?.toLowerCase() ?? ''
  const resolvedFileType: 'pdf' | 'docx' | 'xlsx' | 'image' =
    file_type && ['pdf', 'docx', 'xlsx', 'image'].includes(file_type)
      ? file_type
      : ['png', 'jpeg', 'jpg', 'gif', 'webp'].includes(ext)
        ? 'image'
        : (['pdf', 'docx', 'xlsx'] as const).includes(ext as 'pdf' | 'docx' | 'xlsx')
          ? (ext as 'pdf' | 'docx' | 'xlsx')
          : 'image'

  // Create document record
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id,
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

  if (docErr || !doc) {
    console.error('attach-document insert error:', docErr)
    return NextResponse.json({ error: 'Erreur lors de la création du document.' }, { status: 500 })
  }

  // Create note linking the import
  await supabase.from('notes').insert({
    account_id,
    company_id,
    user_id: user.id,
    title: `Document importé : ${file_name}`,
    content: `Document importé le ${new Date().toLocaleDateString('fr-FR')} : ${file_name}`,
    source: 'import',
    is_deleted: false,
    workspace_id: workspace_id ?? null,
  })

  // Fetch account name for chunk enrichment
  const { data: accountRow } = await supabase.from('accounts').select('name').eq('id', account_id).single()
  const accountName = accountRow?.name ?? 'Inconnu'
  const displayName = file_name.replace(/\.[^.]+$/, '')
  const importDate = new Date().toLocaleDateString('fr-FR')

  // Chunk + embed for RAG
  try {
    const chunks = chunkText(text)
    if (chunks.length > 0) {
      const enrichedChunks = chunks.map(
        (chunk) => `[Entreprise: ${accountName} | Fichier: ${displayName} | Date: ${importDate} | Type: Document]\n\n${chunk}`
      )
      const embeddings = await embedBatch(enrichedChunks)
      await supabase.from('chunks').insert(
        enrichedChunks.map((chunk, i) => ({
          company_id,
          account_id,
          source_type: 'document' as const,
          source_id: doc.id,
          content: chunk,
          embedding: embeddings[i],
          workspace_id: workspace_id ?? null,
          company_name: accountName,
        }))
      )
    }
  } catch (err) {
    console.error('attach-document embedding error:', err)
    // Non-blocking: document is created, indexing failed
  }

  return NextResponse.json({ document_id: doc.id, account_id })
}

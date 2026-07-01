import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { resolveStorageUrl, extractTextFromUrl } from '@/lib/document-indexer'
import { analyzeAccountDocument } from '@/lib/document-analyzer'

// POST /api/documents/analyze
// Body: { documentId: string }
// Returns: { summary, actions, suggestedFolderId }
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { documentId } = await request.json()
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)

  // Fetch document
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, file_name, file_url, file_type, account_id, company_id, workspace_id, is_deleted')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.is_deleted) return NextResponse.json({ error: 'Document is deleted' }, { status: 400 })
  if (doc.company_id !== user.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!['pdf', 'docx', 'xlsx'].includes(doc.file_type)) {
    return NextResponse.json({ error: 'File type not analyzable' }, { status: 400 })
  }

  // Fetch account name
  let accountName = 'Inconnu'
  if (doc.account_id) {
    const { data: acc } = await supabase.from('accounts').select('name').eq('id', doc.account_id).single()
    if (acc?.name) accountName = acc.name
  }

  // Fetch existing folders for this account
  let folderQ = supabase
    .from('folders')
    .select('id, name')
    .eq('company_id', doc.company_id)
    .order('name')
  if (doc.account_id) folderQ = folderQ.eq('account_id', doc.account_id)
  if (doc.workspace_id) folderQ = folderQ.eq('workspace_id', doc.workspace_id)
  const { data: folderRows } = await folderQ
  const existingFolders = ((folderRows ?? []) as Array<{ id: string; name: string }>)

  // Fetch existing contacts for this account
  let contactRows: Array<{ first_name: string | null; last_name: string | null }> = []
  if (doc.account_id) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('first_name, last_name')
      .eq('account_id', doc.account_id)
      .eq('company_id', doc.company_id)
    contactRows = (contacts ?? []) as typeof contactRows
  }
  const existingContacts = contactRows.map((c) => ({
    name: [c.first_name, c.last_name].filter(Boolean).join(' '),
  }))

  // Extract text from document
  let text = ''
  try {
    const signedUrl = await resolveStorageUrl(doc.file_url, supabase)
    text = await extractTextFromUrl(signedUrl, doc.file_type)
  } catch (err) {
    console.error('[documents/analyze] text extraction failed:', err)
    return NextResponse.json({ error: 'Text extraction failed' }, { status: 500 })
  }

  // Analyze
  const result = await analyzeAccountDocument({
    content: text,
    fileName: doc.file_name,
    accountName,
    existingFolders,
    existingContacts,
  })

  return NextResponse.json(result)
}

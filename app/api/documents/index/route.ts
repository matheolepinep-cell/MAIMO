import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { indexDocument } from '@/lib/document-indexer'

// POST /api/documents/index
// Accepts { documentId } — looks up all needed params from DB then indexes
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { documentId } = await request.json()
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, file_url, file_type, account_id, company_id, workspace_id, is_deleted')
    .eq('id', documentId)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.is_deleted) return NextResponse.json({ error: 'Document is deleted' }, { status: 400 })
  if (doc.company_id !== user.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['pdf', 'docx', 'xlsx'].includes(doc.file_type)) {
    return NextResponse.json({ error: 'File type not indexable' }, { status: 400 })
  }

  try {
    const { chunks } = await indexDocument({
      documentId: doc.id,
      fileUrl: doc.file_url,
      fileType: doc.file_type as 'pdf' | 'docx' | 'xlsx',
      accountId: doc.account_id,
      companyId: doc.company_id,
      workspaceId: doc.workspace_id ?? null,
    })

    console.log('[INDEX] Document indexé:', documentId, 'chunks:', chunks)
    return NextResponse.json({ success: true, chunks })
  } catch (err) {
    console.error('[documents/index] error:', err)
    return NextResponse.json({ error: 'Indexing failed' }, { status: 500 })
  }
}

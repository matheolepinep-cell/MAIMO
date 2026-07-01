import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { indexDocument } from '@/lib/document-indexer'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { document_id, file_url, file_type, account_id, company_id, workspace_id } = await request.json()

  if (!document_id || !file_url || !file_type || !account_id || !company_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { chunks } = await indexDocument({
      documentId: document_id,
      fileUrl: file_url,
      fileType: file_type,
      accountId: account_id,
      companyId: company_id,
      workspaceId: workspace_id ?? null,
    })

    console.log('[INDEX] Document indexé:', document_id, 'chunks créés:', chunks)

    // Fire-and-forget: auto-extract account info from document content
    fetch(`${env.appUrl}/api/extract-account-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ document_id, account_id, company_id }),
    }).catch(() => {})

    return NextResponse.json({ success: true, chunks })
  } catch (err) {
    console.error('[index-document] error:', err)
    return NextResponse.json({ error: 'Failed to index document' }, { status: 500 })
  }
}

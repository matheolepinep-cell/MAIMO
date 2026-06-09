import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

function parseBucketAndPath(fileUrl: string): { bucket: string; path: string } {
  if (fileUrl.startsWith('http')) {
    const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (match) return { bucket: match[1], path: match[2] }
  }
  return { bucket: 'imports', path: fileUrl }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Permission check: must be admin or own this account in portfolio
  if (user.role !== 'admin') {
    const { data: entry } = await supabase
      .from('portfolio')
      .select('id')
      .eq('account_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!entry) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify account belongs to the same company
  const { data: account } = await supabase
    .from('accounts')
    .select('id, company_id')
    .eq('id', id)
    .single()
  if (!account || account.company_id !== user.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 1. Delete RAG chunks
  await supabase.from('chunks').delete().eq('account_id', id)

  // 2. Delete documents from storage then DB
  const { data: docs } = await supabase
    .from('documents')
    .select('id, file_url')
    .eq('account_id', id)

  for (const doc of docs ?? []) {
    if (doc.file_url) {
      const { bucket, path } = parseBucketAndPath(doc.file_url)
      await supabase.storage.from(bucket).remove([path]).catch(() => {})
    }
  }
  await supabase.from('documents').delete().eq('account_id', id)

  // 3. Delete notes
  await supabase.from('notes').delete().eq('account_id', id)

  // 4. Delete contacts
  await supabase.from('contacts').delete().eq('account_id', id)

  // 5. Delete portfolio access entries then portfolio entries
  const { data: portfolioEntries } = await supabase
    .from('portfolio')
    .select('id')
    .eq('account_id', id)
  if ((portfolioEntries ?? []).length > 0) {
    const pfIds = (portfolioEntries ?? []).map((e: { id: string }) => e.id)
    await supabase.from('portfolio_access').delete().in('portfolio_id', pfIds)
  }
  await supabase.from('portfolio').delete().eq('account_id', id)

  // 6. Delete muted_companies entries
  await supabase.from('muted_companies').delete().eq('company_id', id)

  // 7. Delete notifications referencing this account
  await supabase.from('notifications').delete().eq('account_id', id)

  // 8. Delete the account itself
  await supabase.from('accounts').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}

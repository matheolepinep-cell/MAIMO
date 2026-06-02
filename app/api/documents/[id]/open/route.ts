import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: document, error } = await supabase
    .from('documents')
    .select('id, company_id, file_url')
    .eq('id', id)
    .single()

  if (error || !document) return new NextResponse('Not found', { status: 404 })
  if (document.company_id !== user.company_id) return new NextResponse('Forbidden', { status: 403 })

  let storagePath = document.file_url
  if (storagePath.startsWith('http')) {
    const marker = '/object/public/documents/'
    const idx = storagePath.indexOf(marker)
    if (idx !== -1) storagePath = storagePath.slice(idx + marker.length)
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600)

  if (signError || !signed?.signedUrl) return new NextResponse('Could not generate URL', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}

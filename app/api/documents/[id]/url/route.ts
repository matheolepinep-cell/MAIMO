import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

function parseBucketAndPath(fileUrl: string): { bucket: string; path: string } {
  if (fileUrl.startsWith('http')) {
    const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (match) return { bucket: match[1], path: match[2] }
  }
  const colonIdx = fileUrl.indexOf(':')
  if (colonIdx > 0) {
    const prefix = fileUrl.slice(0, colonIdx)
    if (['documents', 'imports'].includes(prefix)) {
      return { bucket: prefix, path: fileUrl.slice(colonIdx + 1) }
    }
  }
  return { bucket: 'imports', path: fileUrl }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdmin(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const { data: document, error } = await supabase
    .from('documents')
    .select('id, company_id, file_url')
    .eq('id', id)
    .single()

  if (error || !document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (document.company_id !== user.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { bucket, path } = parseBucketAndPath(document.file_url)

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate signed URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}

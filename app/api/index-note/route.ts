import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { chunkText } from '@/lib/chunker'
import { embedBatch } from '@/lib/embeddings'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { note_id, content, account_id, company_id } = await request.json()

  if (!note_id || !content || !account_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('chunks').delete().eq('source_id', note_id).eq('source_type', 'note')

  const chunks = chunkText(content)
  if (chunks.length === 0) {
    return NextResponse.json({ success: true, chunks: 0 })
  }

  let embeddings: number[][]
  try {
    embeddings = await embedBatch(chunks)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Embedding failed'
    console.error('Embedding error:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const rows = chunks.map((chunk, i) => ({
    company_id: company_id ?? null,
    account_id,
    source_type: 'note' as const,
    source_id: note_id,
    content: chunk,
    embedding: embeddings[i],
  }))

  const { error } = await supabase.from('chunks').insert(rows)

  if (error) {
    console.error('Chunk insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, chunks: rows.length })
}

import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

// PATCH /api/folders/move — move a document or folder into a folder
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, id, folder_id } = await request.json()
  // type: 'document' | 'folder'
  // folder_id: target folder id, or null for root

  if (!type || !id) return NextResponse.json({ error: 'type and id required' }, { status: 400 })
  if (!['document', 'folder'].includes(type)) {
    return NextResponse.json({ error: 'type must be document or folder' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRole)

  if (type === 'document') {
    const { error } = await supabase
      .from('documents')
      .update({ folder_id: folder_id ?? null })
      .eq('id', id)
      .eq('company_id', user.company_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Prevent moving a folder into itself or a descendant
    if (folder_id === id) {
      return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 })
    }

    const { error } = await supabase
      .from('folders')
      .update({ parent_id: folder_id ?? null })
      .eq('id', id)
      .eq('company_id', user.company_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

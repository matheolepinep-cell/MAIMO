import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { createNotification } from '@/lib/notifications'

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getOrCreateConversation(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  recipientId: string
): Promise<string> {
  const participants = [userId, recipientId]

  // Find existing conversation between the two users
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .contains('participants', participants)
    .limit(1)

  if (existing?.[0]) return existing[0].id

  const { data: conv } = await supabase
    .from('conversations')
    .insert({ participants })
    .select('id')
    .single()

  return conv!.id
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipientId, documentId, documentName, filePath, fileType } = await request.json()
  if (!recipientId || !documentId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = adminClient()
  const conversationId = await getOrCreateConversation(supabase, user.id, recipientId)

  // Insert document message using new schema (file_path / file_name / file_type)
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: null,
    file_path: filePath ?? null,
    file_name: documentName ?? null,
    file_type: fileType ?? null,
    read_by: [user.id],
  })

  // Update conversation last_message
  await supabase.from('conversations').update({
    last_message: `📎 ${documentName ?? 'Document'}`,
    last_message_at: new Date().toISOString(),
  }).eq('id', conversationId)

  // Notification for recipient
  await createNotification(
    recipientId,
    null,
    'document_shared',
    `${user.full_name} a partagé un document`,
    documentName ?? null,
    { conversation_id: conversationId, document_id: documentId }
  )

  return NextResponse.json({ ok: true })
}

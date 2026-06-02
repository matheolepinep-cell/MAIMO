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

async function getOrCreateConversation(supabase: ReturnType<typeof adminClient>, companyId: string, userId: string, recipientId: string): Promise<string> {
  // Find existing conversation between the two users
  const { data: myMemberships } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)

  if (myMemberships?.length) {
    const myConvIds = myMemberships.map((m: { conversation_id: string }) => m.conversation_id)
    const { data: recipientMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', recipientId)
      .in('conversation_id', myConvIds)

    if (recipientMemberships?.length) {
      return recipientMemberships[0].conversation_id
    }
  }

  // Create new conversation
  const { data: conv } = await supabase
    .from('conversations')
    .insert({ company_id: companyId })
    .select()
    .single()

  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: userId },
    { conversation_id: conv.id, user_id: recipientId },
  ])

  return conv.id
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipientId, documentId, documentName } = await request.json()
  if (!recipientId || !documentId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = adminClient()

  const conversationId = await getOrCreateConversation(supabase, user.company_id, user.id, recipientId)

  // Insert document message
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: null,
    document_id: documentId,
    message_type: 'document',
  })

  // Create notification
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

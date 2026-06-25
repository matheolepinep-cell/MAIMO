import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { createNotification } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipientId, conversationId } = await request.json()
  if (!recipientId) return NextResponse.json({ ok: true })

  await createNotification(
    recipientId,
    null,
    'message_received',
    `${user.full_name} vous a envoyé un message`,
    null,
    { conversation_id: conversationId ?? '' }
  )

  return NextResponse.json({ ok: true })
}

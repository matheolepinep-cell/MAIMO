import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { createNotification } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipientId, senderName, content, conversationId, type, documentId } = await request.json()
  if (!recipientId) return NextResponse.json({ error: 'Missing recipientId' }, { status: 400 })

  const notifType = type === 'document_shared' ? 'document_shared' : 'message_received'
  const title = notifType === 'document_shared'
    ? `${senderName} a partagé un document`
    : `Nouveau message de ${senderName}`

  await createNotification(
    recipientId,
    null,
    notifType,
    title,
    content ?? null,
    { conversation_id: conversationId ?? '', document_id: documentId ?? '' }
  )

  return NextResponse.json({ ok: true })
}

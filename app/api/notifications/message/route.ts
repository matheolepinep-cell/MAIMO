import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { createNotification } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipientId, senderName, content, conversationId, type, documentId } = await request.json()
  if (!recipientId || type !== 'document_shared') {
    return NextResponse.json({ ok: true })
  }

  await createNotification(
    recipientId,
    null,
    'document_shared',
    `${senderName} a partagé un document`,
    content ?? null,
    { conversation_id: conversationId ?? '', document_id: documentId ?? '' }
  )

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { getNotifiableUsers, notifyTeam } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId, documentId, fileName, accountName } = await request.json()
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })

  // company_id always comes from the authenticated user's profile, never from the request body
  const userIds = await getNotifiableUsers(accountId, user.company_id, user.id)
  if (userIds.length === 0) return NextResponse.json({ ok: true })

  await notifyTeam(
    userIds,
    accountId,
    'document_added',
    `Nouveau document sur ${accountName ?? 'un compte'}`,
    fileName ?? null,
    { account_id: accountId, ...(documentId ? { document_id: documentId } : {}) }
  )

  return NextResponse.json({ ok: true })
}

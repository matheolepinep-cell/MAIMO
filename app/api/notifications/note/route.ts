import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { getNotifiableUsers, notifyTeam } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId, noteId, noteTitle, accountName } = await request.json()
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })

  // company_id always comes from the authenticated user's profile, never from the request body
  const userIds = await getNotifiableUsers(accountId, user.company_id, user.id)
  if (userIds.length === 0) return NextResponse.json({ ok: true })

  await notifyTeam(
    userIds,
    accountId,
    'note_added',
    `Nouvelle note sur ${accountName ?? 'un compte'}`,
    noteTitle ? `"${noteTitle}"` : null,
    { account_id: accountId, ...(noteId ? { note_id: noteId } : {}) }
  )

  return NextResponse.json({ ok: true })
}

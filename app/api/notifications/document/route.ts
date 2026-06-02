import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { getNotifiableUsers, notifyTeam } from '@/lib/notifications'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId, companyId, fileName, accountName } = await request.json()
  if (!accountId || !companyId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const userIds = await getNotifiableUsers(accountId, companyId, user.id)
  if (userIds.length === 0) return NextResponse.json({ ok: true })

  await notifyTeam(
    userIds,
    accountId,
    'document_added',
    `Nouveau document sur ${accountName ?? 'un compte'}`,
    fileName ?? null,
    { account_id: accountId }
  )

  return NextResponse.json({ ok: true })
}

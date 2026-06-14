import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { syncCalendarEvents } from '@/lib/google-calendar'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId } = await request.json().catch(() => ({}))
  const result = await syncCalendarEvents(user.id, workspaceId ?? null)

  return NextResponse.json(result)
}

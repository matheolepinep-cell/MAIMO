import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { createGoogleEvent, deleteGoogleEvent } from '@/lib/google-calendar'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, startTime, endTime, description, location, attendeeEmails, workspaceId, companyId } = await request.json()
  if (!title || !startTime || !endTime) {
    return NextResponse.json({ error: 'title, startTime and endTime are required' }, { status: 400 })
  }

  const event = await createGoogleEvent(user.id, {
    title,
    startTime,
    endTime,
    description,
    location,
    attendeeEmails,
    workspaceId: workspaceId ?? null,
    companyId: companyId ?? null,
  })

  if (!event) return NextResponse.json({ error: 'Google Calendar not connected or failed' }, { status: 500 })

  return NextResponse.json({ event })
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { googleEventId } = await request.json()
  if (!googleEventId) return NextResponse.json({ error: 'googleEventId is required' }, { status: 400 })

  await deleteGoogleEvent(user.id, googleEventId)
  return NextResponse.json({ ok: true })
}

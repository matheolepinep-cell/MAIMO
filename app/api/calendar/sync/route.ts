import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { syncCalendarEvents } from '@/lib/google-calendar'

// SQL required if calendar_events table is missing:
// CREATE TABLE IF NOT EXISTS calendar_events (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid NOT NULL,
//   workspace_id uuid,
//   google_event_id text,
//   title text NOT NULL,
//   description text,
//   start_time timestamptz NOT NULL,
//   end_time timestamptz NOT NULL,
//   location text,
//   attendees jsonb DEFAULT '[]',
//   company_id uuid,
//   synced_from text DEFAULT 'google',
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  console.log('[SYNC ROUTE] userId:', user.id)

  const body = await request.json().catch(() => ({}))
  const { workspaceId } = body as { workspaceId?: string }

  try {
    const result = await syncCalendarEvents(user.id, workspaceId ?? null)
    console.log('[SYNC ROUTE] résultat:', result)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[SYNC ROUTE] exception:', e)
    return NextResponse.json({ error: String(e), synced: 0, updated: 0 }, { status: 500 })
  }
}

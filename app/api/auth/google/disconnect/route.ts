import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await supabase
    .from('users')
    .select('google_access_token')
    .eq('id', user.id)
    .single()

  if (profile?.google_access_token) {
    try {
      const client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      )
      client.setCredentials({ access_token: profile.google_access_token })
      await client.revokeCredentials()
    } catch {
      // Continue even if revoke fails (token may already be expired)
    }
  }

  await supabase.from('users').update({
    google_access_token: null,
    google_refresh_token: null,
    google_token_expiry: null,
    google_calendar_connected: false,
  }).eq('id', user.id)

  return NextResponse.redirect(new URL('/app/settings?google=disconnected', req.url))
}

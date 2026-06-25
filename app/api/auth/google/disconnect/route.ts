import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    env.supabaseUrl, env.supabaseServiceRole
  )

  const { data: profile } = await supabase
    .from('users')
    .select('google_access_token')
    .eq('id', user.id)
    .single()

  if (profile?.google_access_token) {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (clientId && clientSecret) {
      try {
        const client = new google.auth.OAuth2(clientId, clientSecret)
        client.setCredentials({ access_token: profile.google_access_token })
        await client.revokeCredentials()
      } catch {
        // Continue even if revoke fails (token may already be expired)
      }
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

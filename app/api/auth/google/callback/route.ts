import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { env } from '@/lib/env'
import { cookies } from 'next/headers'

const REDIRECT_URI = 'https://www.maimoo.fr/api/auth/google/callback'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.redirect(new URL('/app/settings?google=error', req.url))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/app/settings?google=cancelled', req.url))
  }

  // CSRF check
  const cookieStore = await cookies()
  const savedState = cookieStore.get('google_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/app/settings?google=error', req.url))
  }
  cookieStore.delete('google_oauth_state')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/app/settings?google=error', req.url))
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  try {
    const { tokens } = await client.getToken(code)
    console.log('[GOOGLE CALLBACK] userId:', user.id)
    console.log('[GOOGLE CALLBACK] tokens reçus:', !!tokens.access_token, !!tokens.refresh_token)

    const supabase = createClient(
      env.supabaseUrl, env.supabaseServiceRole
    )

    const { error: updateError } = await supabase.from('users').update({
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token ?? null,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      google_calendar_connected: true,
    }).eq('id', user.id)

    if (updateError) {
      console.error('[GOOGLE CALLBACK] update error:', updateError.message)
      return NextResponse.redirect(new URL('/app/settings?google=error', req.url))
    }

    console.log('[GOOGLE CALLBACK] update OK pour userId:', user.id)
    return NextResponse.redirect(new URL('/app/settings?google=connected', req.url))
  } catch (e) {
    console.error('[GOOGLE CALLBACK] exception:', e)
    return NextResponse.redirect(new URL('/app/settings?google=error', req.url))
  }
}

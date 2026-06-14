import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'
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

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )

  try {
    const { tokens } = await client.getToken(code)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('users').update({
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token ?? null,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      google_calendar_connected: true,
    }).eq('id', user.id)

    return NextResponse.redirect(new URL('/app/settings?google=connected', req.url))
  } catch {
    return NextResponse.redirect(new URL('/app/settings?google=error', req.url))
  }
}

import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const REDIRECT_URI = 'https://www.maimoo.fr/api/auth/google/callback'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
]

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  console.log('GOOGLE_CLIENT_ID:', clientId ? 'présent' : 'MANQUANT')
  console.log('GOOGLE_CLIENT_SECRET:', clientSecret ? 'présent' : 'MANQUANT')

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth credentials not configured on the server.' },
      { status: 500 }
    )
  }

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  const state = crypto.randomBytes(16).toString('hex')

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  })

  const cookieStore = await cookies()
  cookieStore.set('google_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return NextResponse.redirect(url)
}

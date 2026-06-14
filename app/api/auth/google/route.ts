import { NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { getAuthenticatedUser } from '@/lib/auth-server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const REDIRECT_URI = 'https://www.maimoo.fr/api/auth/google/callback'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
]

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )

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

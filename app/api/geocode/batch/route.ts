import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-server'

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ',France')}&format=json&limit=1`
  const res = await fetch(url, { headers: { 'User-Agent': 'Maimoo/1.0' } })
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Accept service role key as bearer token for CLI calls
  const authHeader = request.headers.get('authorization') ?? ''
  const bearerToken = authHeader.replace('Bearer ', '').trim()
  const isServiceRole = bearerToken === process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!isServiceRole) {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // When called with service role, geocode ALL accounts across all companies
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, city')
    .not('city', 'is', null)
    .is('lat', null)

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ geocoded: 0, failed: 0 })
  }

  let geocoded = 0
  let failed = 0

  for (const acc of accounts) {
    if (!acc.city) { failed++; continue }
    const coords = await geocodeCity(acc.city)
    if (coords) {
      await supabase.from('accounts').update({ lat: coords.lat, lng: coords.lng }).eq('id', acc.id)
      geocoded++
    } else {
      failed++
    }
    await delay(150)
  }

  return NextResponse.json({ geocoded, failed })
}

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { city } = await request.json()
  if (!city?.trim()) return NextResponse.json(null)

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city.trim() + ',France')}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Maimoo/1.0' },
    })
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json(null)
    const { lat, lon } = data[0]
    return NextResponse.json({ lat: parseFloat(lat), lng: parseFloat(lon) })
  } catch {
    return NextResponse.json(null)
  }
}

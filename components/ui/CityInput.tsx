'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state?: string
    country?: string
  }
}

interface CityOption {
  cityName: string
  subtitle: string
  lat: number
  lng: number
}

interface CityInputProps {
  value: string
  onChange: (city: string, lat?: number, lng?: number) => void
  label?: string
  placeholder?: string
  id?: string
  className?: string
}

export function CityInput({ value, onChange, label, placeholder = 'Lyon', id, className }: CityInputProps) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<CityOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep query in sync when parent value changes (e.g. initial data load)
  useEffect(() => { setQuery(value) }, [value])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setOptions([]); setOpen(false); return }
    setLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&accept-language=fr`
      const res = await fetch(url, { headers: { 'User-Agent': 'Maimoo/1.0' } })
      const data: NominatimResult[] = await res.json()
      const opts: CityOption[] = data.map((r) => {
        const cityName =
          r.address.city ?? r.address.town ?? r.address.village ?? r.address.municipality ??
          r.display_name.split(',')[0].trim()
        const subtitle = [r.address.county ?? r.address.state, r.address.country]
          .filter(Boolean).join(', ')
        return { cityName, subtitle, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }
      })
      // Deduplicate by cityName
      const seen = new Set<string>()
      const unique = opts.filter((o) => { if (seen.has(o.cityName)) return false; seen.add(o.cityName); return true })
      setOptions(unique)
      setOpen(true)
    } catch {
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    onChange(val) // update parent text immediately (no coords yet)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (opt: CityOption) => {
    setQuery(opt.cityName)
    setOpen(false)
    setOptions([])
    onChange(opt.cityName, opt.lat, opt.lng)
  }

  const handleBlur = () => {
    // Delay so click on option registers first
    setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className={`relative ${className ?? ''}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#0F172A] mb-1.5">{label}</label>
      )}
      <div className="relative">
        <input
          id={id}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (options.length > 0) setOpen(true) }}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all duration-150 pr-8"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8] animate-spin" />
        )}
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white rounded-lg overflow-hidden"
          style={{ border: '0.5px solid var(--color-border-tertiary, #E2E8F0)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-[#94A3B8]">Aucune ville trouvée</p>
          ) : (
            options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={() => handleSelect(opt)}
                className="w-full text-left px-3 py-2 hover:bg-[#F5F5F5] transition-colors duration-100"
              >
                <p className="text-[13px] font-semibold text-[#0F172A] leading-snug">{opt.cityName}</p>
                {opt.subtitle && (
                  <p className="text-[11px] text-[#94A3B8] leading-snug">{opt.subtitle}</p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

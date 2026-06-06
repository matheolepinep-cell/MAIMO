'use client'

import { useEffect, useRef, useState } from 'react'

export type MapAccount = {
  id: string
  name: string
  status: 'client' | 'prospect'
  lat: number
  lng: number
}

interface AccountsMapProps {
  accounts: MapAccount[]
  onNavigate: (accountId: string) => void
  scrollWheelZoom?: boolean
  style?: React.CSSProperties
}

export default function AccountsMap({ accounts, onNavigate, scrollWheelZoom = false, style }: AccountsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null)
  const [isReady, setIsReady] = useState(false)

  // Step 1 — init map + load libraries once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    ;(async () => {
      // Load leaflet (ESM)
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')

      // Load markercluster as side-effect via require — patches L synchronously
      if (typeof window !== 'undefined') {
        require('leaflet.markercluster')
        require('leaflet.markercluster/dist/MarkerCluster.css')
        require('leaflet.markercluster/dist/MarkerCluster.Default.css')
      }

      if (!containerRef.current || mapRef.current) return

      LRef.current = L

      const map = L.map(containerRef.current, {
        center: [46.5, 2.35] as [number, number],
        zoom: 5,
        scrollWheelZoom,
        zoomControl: true,
      })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)

      if (!scrollWheelZoom) {
        map.on('click', () => map.scrollWheelZoom.enable())
        map.on('blur', () => map.scrollWheelZoom.disable())
      }

      setIsReady(true)
    })()

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      clusterRef.current = null
      LRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Step 2 — add/refresh markers only after map + markercluster are ready
  useEffect(() => {
    const map = mapRef.current
    const L = LRef.current
    if (!isReady || !map || !L) return

    // Clear previous cluster layer
    if (clusterRef.current) { map.removeLayer(clusterRef.current); clusterRef.current = null }
    if (accounts.length === 0) return

    // L.markerClusterGroup is now available because require('leaflet.markercluster') patched L
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterGroup = (L as any).markerClusterGroup({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50%;background:#fff;border:2px solid #1E2761;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#1E2761;box-shadow:0 2px 6px rgba(0,0,0,0.15)">${count}</div>`,
          className: '',
          iconSize: [32, 32] as [number, number],
          iconAnchor: [16, 16] as [number, number],
        })
      },
      maxClusterRadius: 50,
    })
    clusterRef.current = clusterGroup

    for (const acc of accounts) {
      const color = acc.status === 'client' ? '#22C55E' : '#F59E0B'
      const icon = L.divIcon({
        html: `<svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`,
        className: '',
        iconSize: [24, 32] as [number, number],
        iconAnchor: [12, 32] as [number, number],
        popupAnchor: [0, -32] as [number, number],
      })

      const marker = L.marker([acc.lat, acc.lng] as [number, number], { icon })
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px;padding:4px 0">
          <p style="font-weight:700;font-size:13px;color:#0F172A;margin:0 0 4px">${acc.name}</p>
          <p style="font-size:11px;color:${color};font-weight:600;margin:0 0 8px">${acc.status === 'client' ? 'Client' : 'Prospect'}</p>
          <button onclick="window.__mapNavigate('${acc.id}')" style="width:100%;padding:6px 10px;background:#1E2761;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Voir la fiche →</button>
        </div>
      `, { maxWidth: 200 })

      clusterGroup.addLayer(marker)
    }

    map.addLayer(clusterGroup)

    // Center on barycentre of geocoded accounts
    const avgLat = accounts.reduce((s, a) => s + a.lat, 0) / accounts.length
    const avgLng = accounts.reduce((s, a) => s + a.lng, 0) / accounts.length
    map.setView([avgLat, avgLng] as [number, number], accounts.length === 1 ? 11 : 6)
  }, [isReady, accounts])

  // Keep navigate callback fresh
  useEffect(() => {
    ;(window as typeof window & { __mapNavigate: (id: string) => void }).__mapNavigate = onNavigate
  }, [onNavigate])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />
}

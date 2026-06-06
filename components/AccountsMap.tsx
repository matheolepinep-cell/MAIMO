'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'

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
  const mapRef = useRef<LeafletMap | null>(null)
  const clusterRef = useRef<LayerGroup | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    ;(async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      await import('leaflet.markercluster')
      await import('leaflet.markercluster/dist/MarkerCluster.css')
      await import('leaflet.markercluster/dist/MarkerCluster.Default.css')

      if (!containerRef.current || mapRef.current) return

      LRef.current = L

      const map = L.map(containerRef.current, {
        center: [46.5, 2.35],
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
    })()

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      clusterRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers whenever accounts change (including initial load)
  useEffect(() => {
    const map = mapRef.current
    const L = LRef.current
    if (!map || !L) return

    // Remove previous cluster layer
    if (clusterRef.current) { map.removeLayer(clusterRef.current); clusterRef.current = null }
    if (accounts.length === 0) return

    // L.markerClusterGroup is available after leaflet.markercluster import augments L
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterGroup: LayerGroup = (L as any).markerClusterGroup({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50%;background:#fff;border:2px solid #1E2761;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#1E2761;box-shadow:0 2px 6px rgba(0,0,0,0.15)">${count}</div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
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
        iconSize: [24, 32],
        iconAnchor: [12, 32],
        popupAnchor: [0, -32],
      })

      const marker = L.marker([acc.lat, acc.lng], { icon })
      const statusLabel = acc.status === 'client' ? 'Client' : 'Prospect'
      const statusColor = color

      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px;padding:4px 0">
          <p style="font-weight:700;font-size:13px;color:#0F172A;margin:0 0 4px">${acc.name}</p>
          <p style="font-size:11px;color:${statusColor};font-weight:600;margin:0 0 8px">${statusLabel}</p>
          <button onclick="window.__mapNavigate('${acc.id}')" style="width:100%;padding:6px 10px;background:#1E2761;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Voir la fiche →</button>
        </div>
      `, { maxWidth: 200 })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(clusterGroup as any).addLayer(marker)
    }

    map.addLayer(clusterGroup)

    // Fit map to markers
    const avgLat = accounts.reduce((s, a) => s + a.lat, 0) / accounts.length
    const avgLng = accounts.reduce((s, a) => s + a.lng, 0) / accounts.length
    map.setView([avgLat, avgLng], accounts.length === 1 ? 11 : 6)
  }, [accounts])

  // Keep navigate callback fresh
  useEffect(() => {
    ;(window as typeof window & { __mapNavigate: (id: string) => void }).__mapNavigate = onNavigate
  }, [onNavigate])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />
}

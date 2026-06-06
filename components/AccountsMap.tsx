'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let L: typeof import('leaflet')
    let markerCluster: typeof import('leaflet.markercluster')

    ;(async () => {
      L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      markerCluster = await import('leaflet.markercluster')
      await import('leaflet.markercluster/dist/MarkerCluster.css')
      await import('leaflet.markercluster/dist/MarkerCluster.Default.css')

      if (!containerRef.current || mapRef.current) return

      // Default center France, zoom 5
      let center: [number, number] = [46.5, 2.35]
      let zoom = 5

      if (accounts.length > 0) {
        const avgLat = accounts.reduce((s, a) => s + a.lat, 0) / accounts.length
        const avgLng = accounts.reduce((s, a) => s + a.lng, 0) / accounts.length
        center = [avgLat, avgLng]
        zoom = accounts.length === 1 ? 11 : 6
      }

      const map = L.map(containerRef.current, {
        center,
        zoom,
        scrollWheelZoom,
        zoomControl: true,
      })

      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)

      // Enable scroll wheel zoom on click
      if (!scrollWheelZoom) {
        map.on('click', () => { map.scrollWheelZoom.enable() })
        map.on('blur', () => { map.scrollWheelZoom.disable() })
      }

      // Marker cluster group — sober white style
      const clusterGroup = (markerCluster as unknown as typeof import('leaflet')).markerClusterGroup({
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

      for (const acc of accounts) {
        const color = acc.status === 'client' ? '#22C55E' : '#F59E0B'
        const icon = L.divIcon({
          html: `<svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}"/>
            <circle cx="12" cy="12" r="5" fill="white"/>
          </svg>`,
          className: '',
          iconSize: [24, 32],
          iconAnchor: [12, 32],
          popupAnchor: [0, -32],
        })

        const marker = L.marker([acc.lat, acc.lng], { icon })
        const statusLabel = acc.status === 'client' ? 'Client' : 'Prospect'
        const statusColor = acc.status === 'client' ? '#22C55E' : '#F59E0B'

        marker.bindPopup(`
          <div style="font-family:system-ui,sans-serif;min-width:160px;padding:4px 0">
            <p style="font-weight:700;font-size:13px;color:#0F172A;margin:0 0 4px">${acc.name}</p>
            <p style="font-size:11px;color:${statusColor};font-weight:600;margin:0 0 8px">${statusLabel}</p>
            <button
              onclick="window.__mapNavigate('${acc.id}')"
              style="width:100%;padding:6px 10px;background:#1E2761;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer"
            >Voir la fiche →</button>
          </div>
        `, { maxWidth: 200 })

        clusterGroup.addLayer(marker)
      }

      map.addLayer(clusterGroup)

      // Global navigate callback for popup button
      ;(window as typeof window & { __mapNavigate: (id: string) => void }).__mapNavigate = onNavigate
    })()

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update navigate callback when prop changes
  useEffect(() => {
    ;(window as typeof window & { __mapNavigate: (id: string) => void }).__mapNavigate = onNavigate
  }, [onNavigate])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />
}

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, X, Trash2, ExternalLink, Plus } from 'lucide-react'

/* ─── types ─── */
type CalRow = {
  id: string
  google_event_id: string | null
  title: string
  start_time: string
  end_time: string
  company_id: string | null
  account_name?: string
  account_id?: string | null
}

type SelectedEvt = {
  id: string
  googleEventId: string | null
  title: string
  start: string
  end: string
  companyId: string | null
  companyName: string | null
  accountId: string | null
}

type CreateForm = {
  title: string
  start: string
  end: string
  companyId: string
}

/* ─── helpers ─── */
function toLocalDateTimeInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/* ─── component ─── */
interface CalendarWidgetProps {
  userId: string
  workspaceId: string | null
  companyId: string
}

export function CalendarWidget({ userId, workspaceId, companyId }: CalendarWidgetProps) {
  const router = useRouter()
  const calRef = useRef<FullCalendar>(null)

  const [events, setEvents] = useState<CalRow[]>([])
  const [fcEvents, setFcEvents] = useState<EventInput[]>([])
  const [syncing, setSyncing] = useState(false)
  const [view, setView] = useState<'timeGridWeek' | 'dayGridMonth' | 'timeGridDay'>('timeGridWeek')

  const [selectedEvt, setSelectedEvt] = useState<SelectedEvt | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [createModal, setCreateModal] = useState<CreateForm | null>(null)
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [creating, setCreating] = useState(false)

  const loadEvents = useCallback(async () => {
    const supabase = createClient()
    const now = new Date()
    const in60Days = new Date(now.getTime() + 60 * 24 * 3600 * 1000)
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, google_event_id, title, start_time, end_time, company_id')
      .eq('user_id', userId)
      .gte('start_time', now.toISOString())
      .lte('start_time', in60Days.toISOString())
      .order('start_time', { ascending: true })
    if (error) {
      console.error('[CALENDAR WIDGET] erreur chargement events:', error.message, error.code)
      return
    }
    if (!data) return

    const accountIds = [...new Set(data.map((e) => e.company_id).filter(Boolean))] as string[]
    const accMap: Record<string, { name: string; id: string }> = {}
    if (accountIds.length > 0) {
      const { data: accs } = await supabase.from('accounts').select('id, name').in('id', accountIds)
      for (const a of accs ?? []) accMap[a.id] = { name: a.name, id: a.id }
    }

    const rows: CalRow[] = data.map((e) => ({
      ...e,
      account_name: e.company_id ? accMap[e.company_id]?.name : undefined,
      account_id: e.company_id ?? null,
    }))
    setEvents(rows)
    setFcEvents(rows.map((e) => ({
      id: e.id,
      title: e.title + (e.account_name ? `\n${e.account_name}` : ''),
      start: e.start_time,
      end: e.end_time,
      backgroundColor: '#0A0A0A',
      borderColor: '#0A0A0A',
      textColor: '#FFFFFF',
      extendedProps: {
        companyId: e.company_id,
        companyName: e.account_name ?? null,
        accountId: e.account_id,
        googleEventId: e.google_event_id,
        rawTitle: e.title,
      },
    })))
  }, [userId])

  const loadAccounts = useCallback(async () => {
    const supabase = createClient()
    let q = supabase.from('accounts').select('id, name').eq('company_id', companyId).order('name').limit(100)
    if (workspaceId) q = q.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    const { data } = await q
    setAccounts(data ?? [])
  }, [companyId, workspaceId])

  useEffect(() => {
    loadEvents()
    loadAccounts()
  }, [loadEvents, loadAccounts])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      await loadEvents()
    } catch { /* silent */ }
    setSyncing(false)
  }

  const handleEventClick = (info: EventClickArg) => {
    const ep = info.event.extendedProps
    setSelectedEvt({
      id: info.event.id,
      googleEventId: ep.googleEventId ?? null,
      title: ep.rawTitle ?? info.event.title,
      start: info.event.startStr,
      end: info.event.endStr,
      companyId: ep.companyId ?? null,
      companyName: ep.companyName ?? null,
      accountId: ep.accountId ?? null,
    })
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvt) return
    setDeleting(true)
    try {
      if (selectedEvt.googleEventId) {
        await fetch('/api/calendar/events', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleEventId: selectedEvt.googleEventId }),
        })
      } else {
        const supabase = createClient()
        await supabase.from('calendar_events').delete().eq('id', selectedEvt.id)
      }
      setSelectedEvt(null)
      await loadEvents()
    } catch { /* silent */ }
    setDeleting(false)
  }

  const handleDateClick = (info: DateClickArg) => {
    const start = new Date(info.date)
    const end = new Date(start.getTime() + 3600_000)
    setCreateModal({
      title: '',
      start: toLocalDateTimeInput(start.toISOString()),
      end: toLocalDateTimeInput(end.toISOString()),
      companyId: '',
    })
  }

  const handleCreate = async () => {
    if (!createModal?.title.trim()) return
    setCreating(true)
    try {
      const startISO = new Date(createModal.start).toISOString()
      const endISO = new Date(createModal.end).toISOString()
      await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createModal.title,
          startTime: startISO,
          endTime: endISO,
          workspaceId,
          companyId: createModal.companyId || null,
        }),
      })
      setCreateModal(null)
      await loadEvents()
    } catch { /* silent */ }
    setCreating(false)
  }

  const changeView = (v: typeof view) => {
    setView(v)
    calRef.current?.getApi().changeView(v)
  }

  return (
    <div className="relative">
      {/* toolbar */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E5E5E5' }}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F5F5F5' }}>
          {([
            { key: 'timeGridDay', label: 'Jour' },
            { key: 'timeGridWeek', label: 'Semaine' },
            { key: 'dayGridMonth', label: 'Mois' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => changeView(key)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={view === key ? { background: '#0A0A0A', color: '#fff' } : { color: '#6B6B6B' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => calRef.current?.getApi().prev()}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-colors hover:bg-[#F5F5F5]"
            style={{ color: '#0A0A0A' }}>‹</button>
          <button onClick={() => calRef.current?.getApi().next()}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-colors hover:bg-[#F5F5F5]"
            style={{ color: '#0A0A0A' }}>›</button>
          <button onClick={() => calRef.current?.getApi().today()}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[#F5F5F5]"
            style={{ color: '#6B6B6B' }}>Aujourd'hui</button>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: '#0A0A0A', color: '#fff' }}
            title="Nouvel événement"
            onClick={() => {
              const now = new Date()
              const end = new Date(now.getTime() + 3600_000)
              setCreateModal({ title: '', start: toLocalDateTimeInput(now.toISOString()), end: toLocalDateTimeInput(end.toISOString()), companyId: '' })
            }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 hover:bg-[#F5F5F5]"
            style={{ color: '#6B6B6B' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync…' : 'Synchroniser'}
          </button>
        </div>
      </div>

      {/* calendar */}
      <div className="px-4 py-3 fc-maimo">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={false}
          locale="fr"
          firstDay={1}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          height={500}
          events={fcEvents}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          selectable={true}
          eventDisplay="block"
          allDaySlot={false}
          nowIndicator={true}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        />
      </div>

      {/* event popup */}
      {selectedEvt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSelectedEvt(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()}
            style={{ border: '1px solid #E5E5E5' }}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-base leading-tight" style={{ color: '#0A0A0A' }}>{selectedEvt.title}</h3>
              <button onClick={() => setSelectedEvt(null)} className="shrink-0 p-1 rounded-lg hover:bg-[#F5F5F5]">
                <X className="w-4 h-4" style={{ color: '#9B9B9B' }} />
              </button>
            </div>

            <div className="space-y-1.5 text-sm" style={{ color: '#6B6B6B' }}>
              <p>{fmtDateTime(selectedEvt.start)}</p>
              {selectedEvt.end && <p>→ {fmtDateTime(selectedEvt.end)}</p>}
            </div>

            {selectedEvt.companyName && selectedEvt.accountId && (
              <button onClick={() => { setSelectedEvt(null); router.push(`/app/accounts/${selectedEvt.accountId}`) }}
                className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                style={{ color: '#0A0A0A' }}>
                <ExternalLink className="w-3.5 h-3.5" />
                {selectedEvt.companyName}
              </button>
            )}

            <button onClick={handleDeleteEvent} disabled={deleting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Suppression…' : 'Supprimer de Google Calendar'}
            </button>
          </div>
        </div>
      )}

      {/* create event modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setCreateModal(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()}
            style={{ border: '1px solid #E5E5E5' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base" style={{ color: '#0A0A0A' }}>Nouvel événement</h3>
              <button onClick={() => setCreateModal(null)} className="p-1 rounded-lg hover:bg-[#F5F5F5]">
                <X className="w-4 h-4" style={{ color: '#9B9B9B' }} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                value={createModal.title}
                onChange={(e) => setCreateModal({ ...createModal, title: e.target.value })}
                placeholder="Titre de l'événement"
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }}
                onFocus={(e) => { e.target.style.borderColor = '#0A0A0A' }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E5E5' }}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: '#6B6B6B' }}>Début</label>
                  <input type="datetime-local" value={createModal.start}
                    onChange={(e) => setCreateModal({ ...createModal, start: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                    style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: '#6B6B6B' }}>Fin</label>
                  <input type="datetime-local" value={createModal.end}
                    onChange={(e) => setCreateModal({ ...createModal, end: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                    style={{ border: '1px solid #E5E5E5', color: '#0A0A0A' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#6B6B6B' }}>Client</label>
                <select value={createModal.companyId}
                  onChange={(e) => setCreateModal({ ...createModal, companyId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                  style={{ border: '1px solid #E5E5E5', color: createModal.companyId ? '#0A0A0A' : '#9B9B9B' }}>
                  <option value="">Aucun client</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating || !createModal.title.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: '#0A0A0A' }}>
              {creating ? 'Création…' : 'Créer l\'événement'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

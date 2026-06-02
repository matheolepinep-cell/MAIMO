'use client'

import { useEffect, useState } from 'react'
import { Bell, FileText, MessageCircle, Share2, StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'
import { Header } from '@/components/layout/Header'

type Notification = {
  id: string
  type: 'note_added' | 'document_added' | 'document_shared' | 'message_received' | 'company_updated'
  title: string
  body: string | null
  read: boolean
  created_at: string
  data: Record<string, string>
}

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

function groupByDate(notifications: Notification[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7)

  const groups: { label: string; items: Notification[] }[] = [
    { label: "Aujourd'hui", items: [] },
    { label: 'Hier', items: [] },
    { label: 'Cette semaine', items: [] },
    { label: 'Plus ancien', items: [] },
  ]

  for (const n of notifications) {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0)
    if (d >= today) groups[0].items.push(n)
    else if (d >= yesterday) groups[1].items.push(n)
    else if (d >= weekAgo) groups[2].items.push(n)
    else groups[3].items.push(n)
  }

  return groups.filter((g) => g.items.length > 0)
}

function notifIcon(type: Notification['type']) {
  if (type === 'note_added') return <StickyNote className="w-4 h-4 text-blue-500" />
  if (type === 'document_added' || type === 'document_shared') return <FileText className="w-4 h-4 text-purple-500" />
  if (type === 'message_received') return <MessageCircle className="w-4 h-4 text-green-500" />
  if (type === 'company_updated') return <Share2 className="w-4 h-4 text-orange-500" />
  return <Bell className="w-4 h-4 text-gray-400" />
}

export default function NotificationsPage() {
  const { profile } = useUser()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAndMarkRead = async () => {
    if (!profile?.id) return
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifications((data as Notification[]) ?? [])
    setLoading(false)

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', profile.id)
      .eq('read', false)
  }

  useEffect(() => {
    fetchAndMarkRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const handleMarkAllRead = async () => {
    if (!profile?.id) return
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleDeleteAll = async () => {
    if (!profile?.id) return
    const supabase = createClient()
    await supabase.from('notifications').delete().eq('user_id', profile.id)
    setNotifications([])
  }

  const groups = groupByDate(notifications)

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Notifications"
        actions={
          notifications.some((n) => !n.read) ? (
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-150"
              style={{ color: '#3B82F6', background: '#EFF6FF' }}
            >
              Tout marquer comme lu
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <Bell className="w-12 h-12 text-gray-200" />
            <p className="text-sm text-[#94A3B8]">Aucune notification</p>
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.label} className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
                  {group.label}
                </p>
                <div className="flex flex-col gap-2">
                  {group.items.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-100"
                      style={{ background: n.read ? '#fff' : '#F0F4FF' }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gray-50 mt-0.5">
                        {notifIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1E293B]">{n.title}</p>
                        {n.body && <p className="text-xs text-[#64748B] mt-0.5">{n.body}</p>}
                        <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 rounded-full shrink-0 mt-2" style={{ background: '#3B82F6' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="pt-2 pb-8 flex justify-center">
              <button
                onClick={handleDeleteAll}
                className="text-xs text-[#94A3B8] hover:text-red-400 transition-all duration-150 px-3 py-1.5"
              >
                Tout supprimer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

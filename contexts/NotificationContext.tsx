'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'

const NotificationContext = createContext<number>(0)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useUser()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profile?.id) return
    const supabase = createClient()

    const fetch = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('read', false)
      setUnreadCount(count ?? 0)
    }

    fetch()

    const channel = supabase
      .channel(`notif-count-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => fetch()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  return (
    <NotificationContext.Provider value={unreadCount}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotificationCount() {
  return useContext(NotificationContext)
}

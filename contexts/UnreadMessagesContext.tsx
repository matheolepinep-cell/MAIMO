'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/contexts/UserContext'

const UnreadMessagesContext = createContext(false)

export function UnreadMessagesProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useUser()
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    const supabase = createClient()
    const userId = profile.id

    const refresh = async () => {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .contains('participants', [userId])

      const convIds = (convs ?? []).map((c: { id: string }) => c.id)
      if (!convIds.length) { setHasUnread(false); return }

      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', userId)
        .not('read_by', 'cs', `{${userId}}`)

      setHasUnread((count ?? 0) > 0)
    }

    refresh()

    const channel = supabase
      .channel(`unread-msgs-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => refresh())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  return (
    <UnreadMessagesContext.Provider value={hasUnread}>
      {children}
    </UnreadMessagesContext.Provider>
  )
}

export function useUnreadMessages() {
  return useContext(UnreadMessagesContext)
}

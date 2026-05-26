'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types/database'

interface UserContextValue {
  profile: UserProfile | null
  loading: boolean
  refresh: () => Promise<void>
}

const UserContext = createContext<UserContextValue>({
  profile: null,
  loading: true,
  refresh: async () => {},
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(data ?? null)
    setLoading(false)
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  return (
    <UserContext.Provider value={{ profile, loading, refresh: fetchProfile }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}

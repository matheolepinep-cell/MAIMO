'use client'

import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import SupportWidget from '@/components/SupportWidget'

export default function SupportWidgetLoader() {
  const { profile } = useUser()
  const { currentWorkspace } = useWorkspace()

  return (
    <SupportWidget
      userName={profile?.full_name}
      userEmail={profile?.email}
      role={currentWorkspace?.role ?? profile?.role}
    />
  )
}

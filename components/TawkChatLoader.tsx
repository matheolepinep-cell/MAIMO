'use client'

import { useUser } from '@/contexts/UserContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import TawkChat from '@/components/TawkChat'

export default function TawkChatLoader() {
  const { profile } = useUser()
  const { currentWorkspace } = useWorkspace()

  return (
    <TawkChat
      userEmail={profile?.email}
      userName={profile?.full_name}
      userId={profile?.id}
      workspaceName={currentWorkspace?.name}
      role={currentWorkspace?.role ?? profile?.role}
    />
  )
}

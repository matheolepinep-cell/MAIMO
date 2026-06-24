import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { WorkspaceRole } from '@/types/database'

export function useRole(): WorkspaceRole {
  const { currentWorkspace } = useWorkspace()
  return (currentWorkspace?.role as WorkspaceRole) ?? 'member'
}

export function useIsWorkspaceAdmin(): boolean {
  return useRole() === 'admin'
}

export function useIsContributeur(): boolean {
  return useRole() === 'contributeur'
}

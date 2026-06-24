'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from './UserContext'
import type { Workspace, WorkspaceRole } from '@/types/database'

type WorkspaceContextType = {
  currentWorkspace: Workspace | null
  setCurrentWorkspace: (ws: Workspace) => void
  userWorkspaces: Workspace[]
  isSuperAdmin: boolean
  refreshWorkspaces: () => Promise<void>
  /** ID de l'espace actif (null si non chargé) */
  wsId: string | null
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  currentWorkspace: null,
  setCurrentWorkspace: () => {},
  userWorkspaces: [],
  isSuperAdmin: false,
  refreshWorkspaces: async () => {},
  wsId: null,
})

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: profileLoading } = useUser()
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null)
  const [userWorkspaces, setUserWorkspaces] = useState<Workspace[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const loadWorkspaces = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()

    // Check super admin flag
    const { data: userRow } = await supabase
      .from('users')
      .select('is_super_admin')
      .eq('id', profile.id)
      .maybeSingle()
    const superAdmin = !!(userRow as { is_super_admin?: boolean } | null)?.is_super_admin
    setIsSuperAdmin(superAdmin)

    let workspaces: Workspace[] = []

    if (superAdmin) {
      // Super admin : tous les espaces de l'organisation
      const { data } = await supabase
        .from('workspaces')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('is_default', { ascending: false })
        .order('created_at')
      workspaces = (data ?? []).map((w: Workspace) => ({ ...w, role: 'admin' as const }))
    } else {
      // Membre : espaces auxquels il appartient
      const { data } = await supabase
        .from('workspace_members')
        .select('role, workspaces(*)')
        .eq('user_id', profile.id)
      type Row = { role: string; workspaces: Workspace | null }
      workspaces = ((data ?? []) as unknown as Row[])
        .filter((m) => m.workspaces)
        .map((m) => ({ ...m.workspaces!, role: m.role as WorkspaceRole }))
    }

    // Auto-création de l'espace "Principal" pour les admins sans espace
    if (workspaces.length === 0 && profile.role === 'admin') {
      const { data: newWs } = await supabase
        .from('workspaces')
        .insert({
          company_id: profile.company_id,
          name: 'Principal',
          color: '1E2761',
          is_default: true,
          created_by: profile.id,
        })
        .select()
        .single()
      if (newWs) {
        await supabase
          .from('workspace_members')
          .insert({ workspace_id: newWs.id, user_id: profile.id, role: 'admin' })
        workspaces = [{ ...(newWs as Workspace), role: 'admin' }]
      }
    }

    setUserWorkspaces(workspaces)

    // Restaurer depuis localStorage
    const savedId =
      typeof window !== 'undefined' ? localStorage.getItem('maimoo_active_workspace') : null
    const saved = savedId ? workspaces.find((w) => w.id === savedId) ?? null : null
    const defaultWs = workspaces.find((w) => w.is_default) ?? workspaces[0] ?? null
    setCurrentWorkspaceState(saved ?? defaultWs)
  }, [profile])

  useEffect(() => {
    if (!profileLoading && profile) loadWorkspaces()
  }, [profileLoading, profile, loadWorkspaces])

  const setCurrentWorkspace = useCallback((ws: Workspace) => {
    setCurrentWorkspaceState(ws)
    if (typeof window !== 'undefined') {
      localStorage.setItem('maimoo_active_workspace', ws.id)
    }
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        setCurrentWorkspace,
        userWorkspaces,
        isSuperAdmin,
        refreshWorkspaces: loadWorkspaces,
        wsId: currentWorkspace?.id ?? null,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

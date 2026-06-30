-- Fix RLS on workspace_members: allow any active member to see all members of their workspace
DROP POLICY IF EXISTS "select_workspace_members" ON workspace_members;

CREATE POLICY "select_workspace_members" ON workspace_members
FOR SELECT USING (
  workspace_id IN (
    SELECT wm.workspace_id
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND wm.is_active = true
  )
);

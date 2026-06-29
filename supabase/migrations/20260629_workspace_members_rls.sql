-- Allow all active members of a workspace to see each other (not just themselves)
DROP POLICY IF EXISTS "select_workspace_members" ON workspace_members;

CREATE POLICY "select_workspace_members" ON workspace_members
FOR SELECT USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND wm.is_active = true
  )
);

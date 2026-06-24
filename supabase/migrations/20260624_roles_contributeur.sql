-- =============================================================
-- Migration : Système de rôles workspace (admin / member / contributeur)
-- =============================================================

-- 1. Ajouter la contrainte CHECK pour les rôles valides
--    (la colonne role existe déjà sans contrainte CHECK)
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('admin', 'member', 'contributeur'));

-- 2. Changer le défaut vers 'member' (déjà correct)
ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'member';

-- 3. Assurer que le créateur de chaque workspace est bien 'admin'
UPDATE workspace_members wm
SET role = 'admin'
FROM workspaces w
WHERE wm.workspace_id = w.id
  AND wm.user_id = w.created_by
  AND wm.role != 'admin';

-- 4. Colonne is_active sur workspace_members (désactivation sans suppression)
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 5. Schéma private pour les helpers DB non exposés via PostgREST
CREATE SCHEMA IF NOT EXISTS private;

-- 6. Fonction helper : rôle de l'utilisateur courant dans un workspace
CREATE OR REPLACE FUNCTION private.get_my_role(ws_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role
  FROM workspace_members
  WHERE user_id = auth.uid()
    AND workspace_id = ws_id
    AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION private.get_my_role(uuid) TO authenticated;

-- =============================================================
-- Table workspace_invites : liens d'invitation tokenisés
-- =============================================================
CREATE TABLE IF NOT EXISTS workspace_invites (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'contributeur')),
  token        text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used         boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);

-- RLS pour workspace_invites
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage invites" ON workspace_invites
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
        AND wm.is_active = true
    )
  );
CREATE POLICY "Anyone can read valid invites by token" ON workspace_invites
  FOR SELECT USING (used = false AND expires_at > now());

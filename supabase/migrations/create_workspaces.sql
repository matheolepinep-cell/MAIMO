-- =============================================================
-- Migration : Système multi-espaces (workspaces)
-- =============================================================
-- Note : "company" = l'organisation Maimoo (table companies)
--        "account"  = un client/prospect (table accounts)
-- =============================================================

-- Table des espaces internes d'une organisation
CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  description text,
  color       text NOT NULL DEFAULT '1E2761',
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  is_default  boolean NOT NULL DEFAULT false
);

-- Membres par espace (rôle indépendant du rôle global)
CREATE TABLE IF NOT EXISTS workspace_members (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role         text NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  created_at   timestamptz DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- workspace_id sur les tables de données
ALTER TABLE accounts      ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE notes         ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE documents     ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE portfolio     ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;

-- Super admin sur le profil utilisateur
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_workspaces_company     ON workspaces(company_id);
CREATE INDEX IF NOT EXISTS idx_wm_user                ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wm_workspace           ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_accounts_workspace     ON accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_workspace        ON notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace    ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_workspace    ON portfolio(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id);

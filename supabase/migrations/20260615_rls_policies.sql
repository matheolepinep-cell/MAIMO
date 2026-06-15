-- RLS policies for all Maimoo tables
-- Run helper functions first, then the ALTER TABLE + CREATE POLICY blocks

-- ─── Helper functions (SECURITY DEFINER, bypass RLS when querying users) ───

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT company_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.get_my_workspace_ids()
RETURNS TABLE(workspace_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION private.is_workspace_admin(ws_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── Enable RLS on all tables ───

ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio            ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE muted_companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_imports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_access         ENABLE ROW LEVEL SECURITY;

-- ─── users ───

DROP POLICY IF EXISTS "service_role_users" ON users;
CREATE POLICY "service_role_users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR company_id = private.get_my_company_id()
);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─── companies ───

DROP POLICY IF EXISTS "service_role_companies" ON companies;
CREATE POLICY "service_role_companies" ON companies FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "companies_select" ON companies;
CREATE POLICY "companies_select" ON companies FOR SELECT TO authenticated
USING (id = private.get_my_company_id());

-- ─── workspaces ───

DROP POLICY IF EXISTS "service_role_workspaces" ON workspaces;
CREATE POLICY "service_role_workspaces" ON workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workspaces_select" ON workspaces;
CREATE POLICY "workspaces_select" ON workspaces FOR SELECT TO authenticated
USING (
  company_id = private.get_my_company_id()
  OR id IN (SELECT workspace_id FROM private.get_my_workspace_ids())
);

DROP POLICY IF EXISTS "workspaces_insert" ON workspaces;
CREATE POLICY "workspaces_insert" ON workspaces FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "workspaces_update" ON workspaces;
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE TO authenticated
USING (private.is_workspace_admin(id));

DROP POLICY IF EXISTS "workspaces_delete" ON workspaces;
CREATE POLICY "workspaces_delete" ON workspaces FOR DELETE TO authenticated
USING (private.is_workspace_admin(id));

-- ─── workspace_members ───

DROP POLICY IF EXISTS "service_role_workspace_members" ON workspace_members;
CREATE POLICY "service_role_workspace_members" ON workspace_members FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;
CREATE POLICY "workspace_members_select" ON workspace_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR workspace_id IN (SELECT workspace_id FROM private.get_my_workspace_ids())
);

DROP POLICY IF EXISTS "workspace_members_insert" ON workspace_members;
CREATE POLICY "workspace_members_insert" ON workspace_members FOR INSERT TO authenticated
WITH CHECK (private.is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS "workspace_members_delete" ON workspace_members;
CREATE POLICY "workspace_members_delete" ON workspace_members FOR DELETE TO authenticated
USING (user_id = auth.uid() OR private.is_workspace_admin(workspace_id));

-- ─── accounts ───

DROP POLICY IF EXISTS "service_role_accounts" ON accounts;
CREATE POLICY "service_role_accounts" ON accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "accounts_select" ON accounts;
CREATE POLICY "accounts_select" ON accounts FOR SELECT TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "accounts_insert" ON accounts;
CREATE POLICY "accounts_insert" ON accounts FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "accounts_update" ON accounts;
CREATE POLICY "accounts_update" ON accounts FOR UPDATE TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "accounts_delete" ON accounts;
CREATE POLICY "accounts_delete" ON accounts FOR DELETE TO authenticated
USING (company_id = private.get_my_company_id());

-- ─── contacts ───

DROP POLICY IF EXISTS "service_role_contacts" ON contacts;
CREATE POLICY "service_role_contacts" ON contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "contacts_select" ON contacts;
CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "contacts_insert" ON contacts;
CREATE POLICY "contacts_insert" ON contacts FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "contacts_update" ON contacts;
CREATE POLICY "contacts_update" ON contacts FOR UPDATE TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "contacts_delete" ON contacts;
CREATE POLICY "contacts_delete" ON contacts FOR DELETE TO authenticated
USING (company_id = private.get_my_company_id());

-- ─── notes ───

DROP POLICY IF EXISTS "service_role_notes" ON notes;
CREATE POLICY "service_role_notes" ON notes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notes_select" ON notes;
CREATE POLICY "notes_select" ON notes FOR SELECT TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "notes_insert" ON notes;
CREATE POLICY "notes_insert" ON notes FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "notes_update" ON notes;
CREATE POLICY "notes_update" ON notes FOR UPDATE TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "notes_delete" ON notes;
CREATE POLICY "notes_delete" ON notes FOR DELETE TO authenticated
USING (company_id = private.get_my_company_id());

-- ─── documents ───

DROP POLICY IF EXISTS "service_role_documents" ON documents;
CREATE POLICY "service_role_documents" ON documents FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "documents_select" ON documents;
CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "documents_insert" ON documents;
CREATE POLICY "documents_insert" ON documents FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "documents_update" ON documents;
CREATE POLICY "documents_update" ON documents FOR UPDATE TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_delete" ON documents FOR DELETE TO authenticated
USING (company_id = private.get_my_company_id());

-- ─── chunks ───

DROP POLICY IF EXISTS "service_role_chunks" ON chunks;
CREATE POLICY "service_role_chunks" ON chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chunks_select" ON chunks;
CREATE POLICY "chunks_select" ON chunks FOR SELECT TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "chunks_insert" ON chunks;
CREATE POLICY "chunks_insert" ON chunks FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "chunks_delete" ON chunks;
CREATE POLICY "chunks_delete" ON chunks FOR DELETE TO authenticated
USING (company_id = private.get_my_company_id());

-- ─── portfolio ───

DROP POLICY IF EXISTS "service_role_portfolio" ON portfolio;
CREATE POLICY "service_role_portfolio" ON portfolio FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "portfolio_select" ON portfolio;
CREATE POLICY "portfolio_select" ON portfolio FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR company_id = private.get_my_company_id()
);

DROP POLICY IF EXISTS "portfolio_insert" ON portfolio;
CREATE POLICY "portfolio_insert" ON portfolio FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "portfolio_delete" ON portfolio;
CREATE POLICY "portfolio_delete" ON portfolio FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── calendar_events ───

DROP POLICY IF EXISTS "service_role_calendar_events" ON calendar_events;
CREATE POLICY "service_role_calendar_events" ON calendar_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "calendar_events_select" ON calendar_events;
CREATE POLICY "calendar_events_select" ON calendar_events FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_insert" ON calendar_events;
CREATE POLICY "calendar_events_insert" ON calendar_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_update" ON calendar_events;
CREATE POLICY "calendar_events_update" ON calendar_events FOR UPDATE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_delete" ON calendar_events;
CREATE POLICY "calendar_events_delete" ON calendar_events FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── conversations ───

DROP POLICY IF EXISTS "service_role_conversations" ON conversations;
CREATE POLICY "service_role_conversations" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conversations_delete" ON conversations;
CREATE POLICY "conversations_delete" ON conversations FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── messages ───

DROP POLICY IF EXISTS "service_role_messages" ON messages;
CREATE POLICY "service_role_messages" ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ─── notifications ───

DROP POLICY IF EXISTS "service_role_notifications" ON notifications;
CREATE POLICY "service_role_notifications" ON notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- ─── muted_companies ───

DROP POLICY IF EXISTS "service_role_muted_companies" ON muted_companies;
CREATE POLICY "service_role_muted_companies" ON muted_companies FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "muted_companies_select" ON muted_companies;
CREATE POLICY "muted_companies_select" ON muted_companies FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "muted_companies_insert" ON muted_companies;
CREATE POLICY "muted_companies_insert" ON muted_companies FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "muted_companies_delete" ON muted_companies;
CREATE POLICY "muted_companies_delete" ON muted_companies FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── bulk_imports ───

DROP POLICY IF EXISTS "service_role_bulk_imports" ON bulk_imports;
CREATE POLICY "service_role_bulk_imports" ON bulk_imports FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bulk_imports_select" ON bulk_imports;
CREATE POLICY "bulk_imports_select" ON bulk_imports FOR SELECT TO authenticated
USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "bulk_imports_insert" ON bulk_imports;
CREATE POLICY "bulk_imports_insert" ON bulk_imports FOR INSERT TO authenticated
WITH CHECK (company_id = private.get_my_company_id());

-- ─── early_access ───

DROP POLICY IF EXISTS "service_role_early_access" ON early_access;
CREATE POLICY "service_role_early_access" ON early_access FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "early_access_select" ON early_access;
CREATE POLICY "early_access_select" ON early_access FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "early_access_insert" ON early_access;
CREATE POLICY "early_access_insert" ON early_access FOR INSERT TO authenticated
WITH CHECK (true);

-- ─── Verify ───
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

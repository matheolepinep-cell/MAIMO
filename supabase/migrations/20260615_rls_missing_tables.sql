-- Fix RLS for tables missing user-accessible policies
-- Applies on top of 20260615_rls_policies.sql

-- ─── search_conversations ───

ALTER TABLE search_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_search_conversations" ON search_conversations;
CREATE POLICY "service_role_search_conversations" ON search_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "select_search_conversations" ON search_conversations;
CREATE POLICY "select_search_conversations" ON search_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_search_conversations" ON search_conversations;
CREATE POLICY "insert_search_conversations" ON search_conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_search_conversations" ON search_conversations;
CREATE POLICY "update_search_conversations" ON search_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_search_conversations" ON search_conversations;
CREATE POLICY "delete_search_conversations" ON search_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── portfolio_access ───
-- Grants a user access to another user's portfolio entry.
-- The owner of the portfolio entry or the named user can read/write.

ALTER TABLE portfolio_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_portfolio_access" ON portfolio_access;
CREATE POLICY "service_role_portfolio_access" ON portfolio_access
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "portfolio_access_select" ON portfolio_access;
CREATE POLICY "portfolio_access_select" ON portfolio_access
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR portfolio_id IN (
      SELECT id FROM portfolio WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portfolio_access_insert" ON portfolio_access;
CREATE POLICY "portfolio_access_insert" ON portfolio_access
  FOR INSERT TO authenticated
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolio WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portfolio_access_delete" ON portfolio_access;
CREATE POLICY "portfolio_access_delete" ON portfolio_access
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR portfolio_id IN (
      SELECT id FROM portfolio WHERE user_id = auth.uid()
    )
  );

-- ─── clients (legacy table, same company_id isolation as accounts) ───

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_clients" ON clients;
CREATE POLICY "service_role_clients" ON clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clients_select" ON clients;
CREATE POLICY "clients_select" ON clients
  FOR SELECT TO authenticated
  USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "clients_insert" ON clients;
CREATE POLICY "clients_insert" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "clients_update" ON clients;
CREATE POLICY "clients_update" ON clients
  FOR UPDATE TO authenticated
  USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "clients_delete" ON clients;
CREATE POLICY "clients_delete" ON clients
  FOR DELETE TO authenticated
  USING (company_id = private.get_my_company_id());

-- ─── permissions (managed via API only, no direct client access needed) ───

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_permissions" ON permissions;
CREATE POLICY "service_role_permissions" ON permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "permissions_select" ON permissions;
CREATE POLICY "permissions_select" ON permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id = private.get_my_company_id()
  );

-- ─── Verify ───
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('search_conversations', 'portfolio_access', 'clients', 'permissions')
ORDER BY tablename, policyname;

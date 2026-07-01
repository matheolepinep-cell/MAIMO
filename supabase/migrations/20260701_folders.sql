-- Hierarchical folder system for client file storage

-- ─── folders table ───
CREATE TABLE IF NOT EXISTS folders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  parent_id     uuid REFERENCES folders(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── add columns to documents ───
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id   uuid REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url    text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size   bigint;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_type   text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_indexed  boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS indexed_at  timestamptz;

-- ─── indexes ───
CREATE INDEX IF NOT EXISTS folders_company_id_idx    ON folders(company_id);
CREATE INDEX IF NOT EXISTS folders_account_id_idx    ON folders(account_id);
CREATE INDEX IF NOT EXISTS folders_parent_id_idx     ON folders(parent_id);
CREATE INDEX IF NOT EXISTS documents_folder_id_idx   ON documents(folder_id);

-- ─── updated_at trigger ───
CREATE OR REPLACE FUNCTION update_folders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS folders_updated_at ON folders;
CREATE TRIGGER folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION update_folders_updated_at();

-- ─── RLS ───
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_folders" ON folders;
CREATE POLICY "service_role_folders" ON folders FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "folders_select" ON folders;
CREATE POLICY "folders_select" ON folders FOR SELECT TO authenticated
  USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "folders_insert" ON folders;
CREATE POLICY "folders_insert" ON folders FOR INSERT TO authenticated
  WITH CHECK (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "folders_update" ON folders;
CREATE POLICY "folders_update" ON folders FOR UPDATE TO authenticated
  USING (company_id = private.get_my_company_id());

DROP POLICY IF EXISTS "folders_delete" ON folders;
CREATE POLICY "folders_delete" ON folders FOR DELETE TO authenticated
  USING (company_id = private.get_my_company_id());

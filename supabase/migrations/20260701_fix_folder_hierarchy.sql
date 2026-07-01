-- Rattacher les dossiers custom créés depuis les fiches clients
-- (parent_id IS NULL, account_id IS NOT NULL) au dossier 'account'
-- correspondant dans la page Documents globale.
--
-- À exécuter dans Supabase SQL Editor avant de déployer.

UPDATE folders f
SET parent_id = (
  SELECT id FROM folders
  WHERE folder_type = 'account'
    AND account_id = f.account_id
    AND workspace_id = f.workspace_id
    AND parent_id IS NULL
  LIMIT 1
)
WHERE f.folder_type = 'custom'
  AND f.parent_id IS NULL
  AND f.account_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM folders p
    WHERE p.folder_type = 'account'
      AND p.account_id = f.account_id
      AND p.workspace_id = f.workspace_id
      AND p.parent_id IS NULL
  );

-- Correctif : la colonne company_id dans muted_companies doit référencer accounts(id),
-- pas companies(id) (comme indiqué dans la spec initiale).
-- En effet, le code stocke des UUIDs de la table accounts (clients/prospects),
-- pas la table companies (l'organisation Maimo de l'utilisateur).
--
-- À exécuter uniquement si muted_companies a été créée avec REFERENCES companies(id).
-- Vérifie d'abord dans l'éditeur SQL :
--   SELECT conname, confrelid::regclass FROM pg_constraint WHERE conrelid = 'muted_companies'::regclass;
-- Si le résultat montre "companies", exécute le bloc ci-dessous.

-- Supprimer l'ancienne contrainte FK (remplace le nom si différent)
-- ALTER TABLE muted_companies DROP CONSTRAINT IF EXISTS muted_companies_company_id_fkey;

-- Recréer avec la bonne référence
-- ALTER TABLE muted_companies
--   ADD CONSTRAINT muted_companies_company_id_fkey
--   FOREIGN KEY (company_id) REFERENCES accounts(id) ON DELETE CASCADE;

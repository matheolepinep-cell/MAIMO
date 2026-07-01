-- Ajouter un type à la table folders pour distinguer
-- les dossiers système des dossiers custom
ALTER TABLE folders
ADD COLUMN IF NOT EXISTS folder_type TEXT DEFAULT 'custom'
  CHECK (folder_type IN ('general', 'account', 'custom'));

-- Ajouter is_global pour les documents importés via la page Documents globale
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

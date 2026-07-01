-- Delete RAG chunks when a document is soft-deleted (is_deleted set to true).
-- Runs AFTER UPDATE so we can compare OLD vs NEW values.

CREATE OR REPLACE FUNCTION delete_chunks_on_document_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = TRUE AND (OLD.is_deleted IS DISTINCT FROM TRUE) THEN
    DELETE FROM chunks
    WHERE source_id = NEW.id::TEXT
      AND source_type = 'document';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_document_deleted ON documents;

CREATE TRIGGER on_document_deleted
  AFTER UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION delete_chunks_on_document_soft_delete();

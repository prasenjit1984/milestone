-- Allow importing a PDF directly from the parent's computer, not just from
-- Google Drive (docs/architecture/rag-content-pipeline.md, Stage 2 extension).
-- drive_file_id is meaningless for an uploaded file, so it becomes nullable;
-- `source` records which path a document came in through.
ALTER TABLE "source_documents" ALTER COLUMN "drive_file_id" DROP NOT NULL;
ALTER TABLE "source_documents" ADD COLUMN "source" text NOT NULL DEFAULT 'drive';

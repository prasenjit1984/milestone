-- Stage 1 of the PDF content pipeline (docs/architecture/rag-content-pipeline.md):
-- the source-material tables, and the pgvector extension they need. No RLS
-- bypass tricks here — same owner-chain-back-to-parents pattern as every
-- other table (see migrations/0001_rls.sql).

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"page_range" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"title" text NOT NULL,
	"grade" smallint NOT NULL,
	"subject" text NOT NULL,
	"domain" text,
	"page_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Cosine-distance index for the similarity ranking step in Stage 3
-- (generateDraftsFromChunks). HNSW builds incrementally, so creating it now
-- against an empty table is fine — no need to wait until there's data.
CREATE INDEX "source_chunks_embedding_idx" ON "source_chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
ALTER TABLE "source_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "source_documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "source_documents_owner" ON "source_documents"
  FOR ALL
  USING ("parent_id" = app_current_parent_id())
  WITH CHECK ("parent_id" = app_current_parent_id());
--> statement-breakpoint
ALTER TABLE "source_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "source_chunks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "source_chunks_owner" ON "source_chunks"
  FOR ALL
  USING (EXISTS (SELECT 1 FROM source_documents d WHERE d.id = source_chunks.source_document_id AND d.parent_id = app_current_parent_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM source_documents d WHERE d.id = source_chunks.source_document_id AND d.parent_id = app_current_parent_id()));

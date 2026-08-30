-- Table-of-contents extraction for the PDF content pipeline
-- (docs/architecture/rag-content-pipeline.md): a cached, Claude-generated
-- list of the distinct topics/practice scenarios one imported PDF actually
-- covers, each citing which of its source_chunks it was drawn from. Lets a
-- parent pick a specific scenario to generate questions from instead of
-- guessing a free-text topic. Same owner-chain RLS pattern as source_chunks
-- (join through source_documents — see migrations/0007_source_content.sql).
CREATE TABLE "source_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"chunk_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_topics" ADD CONSTRAINT "source_topics_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source_topics" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "source_topics" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "source_topics_owner" ON "source_topics"
  FOR ALL
  USING (EXISTS (SELECT 1 FROM source_documents d WHERE d.id = source_topics.source_document_id AND d.parent_id = app_current_parent_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM source_documents d WHERE d.id = source_topics.source_document_id AND d.parent_id = app_current_parent_id()));

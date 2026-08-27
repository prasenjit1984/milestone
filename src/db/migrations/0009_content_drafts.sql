-- Stage 3 of the PDF content pipeline (docs/architecture/rag-content-pipeline.md):
-- the AI-generated review queue. Kept separate from math_items/reading_passages
-- so nothing half-reviewed can ever reach a kid's practice session by accident.
-- Same owner-chain-to-parents RLS pattern as every other table (see
-- migrations/0001_rls.sql, 0007_source_content.sql).
CREATE TABLE "content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_chunk_ids" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "content_drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "content_drafts_owner" ON "content_drafts"
  FOR ALL
  USING ("parent_id" = app_current_parent_id())
  WITH CHECK ("parent_id" = app_current_parent_id());

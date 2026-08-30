"use server";

import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { sourceDocuments, sourceChunks, sourceTopics } from "@/db/schema";
import { db, withParentContext } from "@/db";
import { requireParentModeUnlocked } from "@/lib/data/dal";
import { extractTopics } from "@/lib/rag/generate";

// Same reasoning as content-drafts.ts's MAX_CHUNKS/MAX_SOURCE_TEXT_CHARS —
// bound the call regardless of how long the source document is.
const MAX_TOPIC_CHUNKS = 60;
const MAX_TOPIC_TEXT_CHARS = 30000;

export interface SourceTopicSummary {
  id: string;
  sourceDocumentId: string;
  label: string;
  description: string;
  pageRanges: string[];
}

export interface ExtractTopicsResult {
  topics: SourceTopicSummary[];
  // See the comment on content-drafts.ts's GenerateDraftsResult.error — same
  // reasoning: return failures as data so the client's error message isn't
  // redacted away by Next.js's production Server Action error handling.
  error?: string;
}

async function resolveTopicSummaries(
  tx: typeof db,
  rows: { id: string; sourceDocumentId: string; label: string; description: string; chunkIds: string[] }[]
): Promise<SourceTopicSummary[]> {
  const allChunkIds = Array.from(new Set(rows.flatMap((r) => r.chunkIds)));
  const chunkRows = allChunkIds.length
    ? await tx.select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange }).from(sourceChunks).where(inArray(sourceChunks.id, allChunkIds))
    : [];
  const pageById = new Map(chunkRows.map((c) => [c.id, c.pageRange]));
  return rows.map((r) => ({
    id: r.id,
    sourceDocumentId: r.sourceDocumentId,
    label: r.label,
    description: r.description,
    pageRanges: r.chunkIds.map((id) => pageById.get(id)).filter((p): p is string => Boolean(p)),
  }));
}

/**
 * Finds (or returns the cached) "table of contents" for one imported PDF —
 * see the comment on sourceTopics in src/db/schema.ts. Extraction only runs
 * once per document unless `force` is set (used by the panel's "Re-scan"
 * action), which replaces the cached rows rather than adding to them.
 */
export async function extractTopicsForDocument(sourceDocumentId: string, opts?: { force?: boolean }): Promise<ExtractTopicsResult> {
  const parentId = await requireParentModeUnlocked();
  const id = z.string().trim().uuid().parse(sourceDocumentId);

  try {
    return await withParentContext(parentId, async (tx) => {
      const [doc] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, id));
      if (!doc) throw new Error("That source document wasn't found.");

      if (opts?.force) {
        await tx.delete(sourceTopics).where(eq(sourceTopics.sourceDocumentId, id));
      } else {
        const existing = await tx.select().from(sourceTopics).where(eq(sourceTopics.sourceDocumentId, id)).orderBy(sourceTopics.createdAt);
        if (existing.length > 0) {
          return { topics: await resolveTopicSummaries(tx, existing) };
        }
      }

      const chunks = await tx
        .select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange, text: sourceChunks.text })
        .from(sourceChunks)
        .where(eq(sourceChunks.sourceDocumentId, id))
        .orderBy(sourceChunks.createdAt)
        .limit(MAX_TOPIC_CHUNKS);
      if (chunks.length === 0) {
        throw new Error(`"${doc.title}" has no extracted text yet — re-import it if this seems wrong.`);
      }

      const found = await extractTopics({ chunks, maxChars: MAX_TOPIC_TEXT_CHARS });
      if (found.length === 0) {
        throw new Error("Claude couldn't find distinct topics in this document — try a different PDF, or generate questions from the whole document instead.");
      }

      const rows = found.map((t) => ({ sourceDocumentId: id, label: t.label, description: t.description, chunkIds: t.chunkIds }));
      const inserted = await tx.insert(sourceTopics).values(rows).returning();
      return { topics: await resolveTopicSummaries(tx, inserted) };
    });
  } catch (err) {
    console.error("[actions/source-topics] extractTopicsForDocument failed:", err);
    return { topics: [], error: err instanceof Error ? err.message : "Couldn't find topics in that PDF — please try again." };
  }
}

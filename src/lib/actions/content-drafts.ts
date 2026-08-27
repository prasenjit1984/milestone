"use server";

import { z } from "zod";
import { and, cosineDistance, eq, isNotNull } from "drizzle-orm";
import { contentDrafts, mathItems, readingPassages, sourceChunks, sourceDocuments } from "@/db/schema";
import { withParentContext } from "@/db";
import { requireParentModeUnlocked } from "@/lib/data/dal";
import { embedQuery } from "@/lib/rag/embeddings";
import { generateMathDrafts, generateReadingDrafts, type GeneratedMathDraft, type GeneratedReadingDraft } from "@/lib/rag/generate";

// Keep the prompt bounded regardless of how many/how large the selected
// chunks are — a handful of workbook pages is plenty of grounding material
// and keeps generation calls fast and cheap.
const MAX_CHUNKS = 6;
const MAX_SOURCE_TEXT_CHARS = 16000;

const GenerateDraftsSchema = z.object({
  sourceDocumentId: z.string().trim().uuid(),
  count: z.number().int().min(1).max(10).default(5),
  topic: z.string().trim().max(200).optional(),
});

export type GenerateDraftsInput = z.infer<typeof GenerateDraftsSchema>;

export interface GenerateDraftsResult {
  created: number;
}

/**
 * Stage 3 of the PDF pipeline (docs/architecture/rag-content-pipeline.md):
 * pick a document's chunks (tag-filtered by the document's own grade/subject/
 * domain, optionally similarity-ranked against a parent-typed topic), hand
 * them to Claude with a schema-locked prompt (src/lib/rag/generate.ts), and
 * store the results as pending content_drafts rows for the review queue
 * below. Nothing here touches math_items/reading_passages directly — that
 * only happens on approve (reviewContentDraft).
 */
export async function generateDraftsFromChunks(input: GenerateDraftsInput): Promise<GenerateDraftsResult> {
  const parentId = await requireParentModeUnlocked();
  const parsed = GenerateDraftsSchema.parse(input);

  return withParentContext(parentId, async (tx) => {
    const [doc] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, parsed.sourceDocumentId));
    if (!doc) throw new Error("That source document wasn't found.");

    if (doc.subject === "math" && !doc.domain) {
      throw new Error(`"${doc.title}" wasn't tagged with a domain at import — delete and re-import it with a domain set to generate math questions from it.`);
    }

    // Rank by similarity to the parent's topic when both a topic was given
    // and this document actually has embedded chunks (Voyage configured and
    // succeeded at import time); otherwise fall back to page order, capped.
    let chunks: { id: string; pageRange: string; text: string }[] = [];
    const queryEmbedding = parsed.topic ? await embedQuery(parsed.topic) : null;
    if (queryEmbedding) {
      chunks = await tx
        .select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange, text: sourceChunks.text })
        .from(sourceChunks)
        .where(and(eq(sourceChunks.sourceDocumentId, doc.id), isNotNull(sourceChunks.embedding)))
        .orderBy(cosineDistance(sourceChunks.embedding, queryEmbedding))
        .limit(MAX_CHUNKS);
    }
    if (chunks.length === 0) {
      chunks = await tx
        .select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange, text: sourceChunks.text })
        .from(sourceChunks)
        .where(eq(sourceChunks.sourceDocumentId, doc.id))
        .orderBy(sourceChunks.createdAt)
        .limit(MAX_CHUNKS);
    }
    if (chunks.length === 0) {
      throw new Error(`"${doc.title}" has no extracted text to generate from.`);
    }

    const sourceText = chunks
      .map((c) => `[page ${c.pageRange}]\n${c.text}`)
      .join("\n\n---\n\n")
      .slice(0, MAX_SOURCE_TEXT_CHARS);

    const drafts: GeneratedMathDraft[] | GeneratedReadingDraft[] =
      doc.subject === "math"
        ? await generateMathDrafts({ grade: doc.grade, domain: doc.domain!, count: parsed.count, sourceText })
        : await generateReadingDrafts({ grade: doc.grade, topic: doc.domain ?? parsed.topic, count: parsed.count, sourceText });

    if (drafts.length === 0) throw new Error("Claude didn't return any drafts — try again, or pick a different document.");

    const chunkIds = chunks.map((c) => c.id);
    const kind = doc.subject === "math" ? "math_item" : "reading_passage";

    const rows = drafts.map((d) => ({
      parentId,
      kind,
      payload:
        doc.subject === "math"
          ? { grade: doc.grade, domain: doc.domain!, ...(d as GeneratedMathDraft) }
          : { grade: doc.grade, topic: doc.domain ?? null, ...(d as GeneratedReadingDraft) },
      sourceChunkIds: chunkIds,
      status: "pending" as const,
    }));

    await tx.insert(contentDrafts).values(rows);
    return { created: rows.length };
  });
}

const MathDraftPayloadSchema = z.object({
  grade: z.union([z.literal(2), z.literal(4)]),
  domain: z.enum(["NR", "PAR", "MDR", "GSR"]),
  topic: z.string().trim().min(1).max(64),
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().trim().min(1).max(500),
  choices: z.array(z.string().trim().min(1).max(200)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(500),
});

const ReadingDraftPayloadSchema = z.object({
  grade: z.union([z.literal(2), z.literal(4)]),
  topic: z.string().trim().max(64).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["story", "informational"]),
  body: z.string().trim().min(1).max(8000),
  mc: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(300),
        choices: z.array(z.string().trim().min(1).max(200)).length(4),
        answerIndex: z.number().int().min(0).max(3),
      })
    )
    .min(1)
    .max(6),
  writing: z
    .array(
      z.object({
        type: z.enum(["summary", "opinion"]),
        prompt: z.string().trim().min(1).max(300),
        starter: z.string().trim().min(1).max(200),
        exemplar: z.string().trim().min(1).max(1000),
        keywords: z.array(z.string().trim().min(1).max(40)).max(10),
      })
    )
    .min(1)
    .max(4),
});

const ReviewActionSchema = z.enum(["approve", "discard"]);

/**
 * Approve copies the draft's payload into the live math_items/reading_passages
 * table (parentId = this family, same as a manually-authored custom
 * question) and marks the draft approved; discard just marks it discarded.
 * A draft never becomes "live" by itself — approve always creates a brand
 * new row, and payload is re-validated here (not just trusted from the DB)
 * before it ever reaches a kid-visible table.
 */
export async function reviewContentDraft(id: string, action: "approve" | "discard"): Promise<void> {
  const parentId = await requireParentModeUnlocked();
  const parsedId = z.string().trim().uuid().parse(id);
  const parsedAction = ReviewActionSchema.parse(action);

  await withParentContext(parentId, async (tx) => {
    const [draft] = await tx.select().from(contentDrafts).where(eq(contentDrafts.id, parsedId));
    if (!draft) throw new Error("That draft wasn't found.");
    if (draft.status !== "pending") throw new Error("That draft was already reviewed.");

    if (parsedAction === "discard") {
      await tx.update(contentDrafts).set({ status: "discarded", reviewedAt: new Date() }).where(eq(contentDrafts.id, parsedId));
      return;
    }

    const payload = draft.payload as Record<string, unknown>;
    if (draft.kind === "math_item") {
      const p = MathDraftPayloadSchema.parse(payload);
      await tx.insert(mathItems).values({
        parentId,
        grade: p.grade,
        domain: p.domain,
        topic: p.topic,
        code: `${p.grade}.${p.domain}.ai-${Date.now().toString(36)}`,
        difficulty: p.difficulty,
        prompt: p.prompt,
        choices: p.choices,
        answerIndex: p.answerIndex,
        explanation: p.explanation,
      });
    } else if (draft.kind === "reading_passage") {
      const p = ReadingDraftPayloadSchema.parse(payload);
      await tx.insert(readingPassages).values({
        parentId,
        grade: p.grade,
        title: p.title,
        kind: p.kind,
        topic: p.topic ?? null,
        body: p.body,
        words: p.body.trim().split(/\s+/).filter(Boolean).length,
        mc: p.mc,
        writing: p.writing,
      });
    } else {
      throw new Error(`Unknown draft kind "${draft.kind}".`);
    }

    await tx.update(contentDrafts).set({ status: "approved", reviewedAt: new Date() }).where(eq(contentDrafts.id, parsedId));
  });
}

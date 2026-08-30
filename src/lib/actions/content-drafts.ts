"use server";

import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { contentDrafts, mathItems, readingPassages, sourceChunks, sourceDocuments, sourceTopics } from "@/db/schema";
import { withParentContext } from "@/db";
import { requireParentModeUnlocked } from "@/lib/data/dal";
import { generateMathDrafts, generateReadingDrafts, type GeneratedMathDraft, type GeneratedReadingDraft } from "@/lib/rag/generate";

// Keep the prompt bounded regardless of how many/how large a topic's chunks
// are — a handful of workbook pages is plenty of grounding material and
// keeps generation calls fast and cheap.
const MAX_SOURCE_TEXT_CHARS = 16000;

const GenerateFromTopicsSchema = z.object({
  sourceDocumentId: z.string().trim().uuid(),
  topicIds: z.array(z.string().trim().uuid()).min(1).max(12),
  // Total drafts across every selected topic, not per topic — split as
  // evenly as possible below (see generateDraftsFromTopics).
  count: z.number().int().min(1).max(30).default(6),
});

export type GenerateFromTopicsInput = z.infer<typeof GenerateFromTopicsSchema>;

export interface GenerateDraftsResult {
  created: number;
  // Set instead of throwing on any failure below (missing document, missing
  // domain tag, no extractable text, or a failed/unconfigured Claude call).
  // Next.js redacts a thrown Server Action error down to an opaque "Minified
  // React error #441" on the client in production (confirmed the hard way —
  // see the setAppId/CSP debugging in docs/architecture/rag-content-pipeline.md's
  // history), so every expected failure path here returns data instead of
  // throwing, and the caller shows `error` directly rather than relying on a
  // caught exception's message.
  error?: string;
}

/**
 * Stage 3 of the PDF pipeline (docs/architecture/rag-content-pipeline.md):
 * a parent picks one or more entries from a document's extracted "table of
 * contents" (src/lib/actions/source-topics.ts), and this generates drafts
 * grounded specifically in each topic's own cited chunks — no similarity
 * guesswork, since the topic already resolved exactly which pages it covers.
 * The requested count is split as evenly as possible across the selected
 * topics. Stores results as pending content_drafts rows for the review queue
 * below; nothing here touches math_items/reading_passages directly — that
 * only happens on approve (reviewContentDraft).
 */
export async function generateDraftsFromTopics(input: GenerateFromTopicsInput): Promise<GenerateDraftsResult> {
  const parentId = await requireParentModeUnlocked();
  const parsed = GenerateFromTopicsSchema.parse(input);

  try {
    return await withParentContext(parentId, async (tx) => {
      const [doc] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, parsed.sourceDocumentId));
      if (!doc) throw new Error("That source document wasn't found.");

      if (doc.subject === "math" && !doc.domain) {
        throw new Error(`"${doc.title}" wasn't tagged with a domain at import — delete and re-import it with a domain set to generate math questions from it.`);
      }

      const topics = await tx.select().from(sourceTopics).where(inArray(sourceTopics.id, parsed.topicIds));
      if (topics.length !== parsed.topicIds.length || topics.some((t) => t.sourceDocumentId !== doc.id)) {
        throw new Error("One or more selected topics weren't found — try refreshing the page.");
      }

      // Split the requested total as evenly as possible: base count per
      // topic, plus one extra for the first `remainder` topics so the sum
      // always matches what was asked for (at least 1 each).
      const n = topics.length;
      const base = Math.max(1, Math.floor(parsed.count / n));
      const remainder = Math.max(0, parsed.count - base * n);

      const kind = doc.subject === "math" ? "math_item" : "reading_passage";
      let totalCreated = 0;

      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        const chunkIds = topic.chunkIds as string[];
        const chunkRows = chunkIds.length
          ? await tx
              .select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange, text: sourceChunks.text })
              .from(sourceChunks)
              .where(inArray(sourceChunks.id, chunkIds))
          : [];
        if (chunkRows.length === 0) continue; // e.g. chunks removed by a re-import since this topic was extracted

        const sourceText = chunkRows
          .map((c) => `[page ${c.pageRange}]\n${c.text}`)
          .join("\n\n---\n\n")
          .slice(0, MAX_SOURCE_TEXT_CHARS);
        const countForTopic = base + (i < remainder ? 1 : 0);

        const drafts: GeneratedMathDraft[] | GeneratedReadingDraft[] =
          doc.subject === "math"
            ? await generateMathDrafts({ grade: doc.grade, domain: doc.domain!, count: countForTopic, sourceText })
            : await generateReadingDrafts({ grade: doc.grade, topic: doc.domain ?? topic.label, count: countForTopic, sourceText });
        if (drafts.length === 0) continue;

        const chunkIdsForRows = chunkRows.map((c) => c.id);
        const rows = drafts.map((d) => ({
          parentId,
          kind,
          payload:
            doc.subject === "math"
              ? { grade: doc.grade, domain: doc.domain!, ...(d as GeneratedMathDraft) }
              : { grade: doc.grade, topic: doc.domain ?? null, ...(d as GeneratedReadingDraft) },
          sourceChunkIds: chunkIdsForRows,
          status: "pending" as const,
        }));
        await tx.insert(contentDrafts).values(rows);
        totalCreated += rows.length;
      }

      if (totalCreated === 0) {
        throw new Error("Claude didn't return any drafts for the selected topics — try again, or pick different topics.");
      }
      return { created: totalCreated };
    });
  } catch (err) {
    console.error("[actions/content-drafts] generateDraftsFromTopics failed:", err);
    return { created: 0, error: err instanceof Error ? err.message : "Couldn't generate drafts — please try again." };
  }
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

export interface ReviewDraftResult {
  ok: boolean;
  // See the comment on GenerateDraftsResult.error — same reasoning: return
  // failures as data so the client's error message isn't redacted away.
  error?: string;
}

/**
 * Approve copies the draft's payload into the live math_items/reading_passages
 * table (parentId = this family, same as a manually-authored custom
 * question) and marks the draft approved; discard just marks it discarded.
 * A draft never becomes "live" by itself — approve always creates a brand
 * new row, and payload is re-validated here (not just trusted from the DB)
 * before it ever reaches a kid-visible table.
 */
export async function reviewContentDraft(id: string, action: "approve" | "discard"): Promise<ReviewDraftResult> {
  const parentId = await requireParentModeUnlocked();
  const parsedId = z.string().trim().uuid().parse(id);
  const parsedAction = ReviewActionSchema.parse(action);

  try {
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
    return { ok: true };
  } catch (err) {
    console.error("[actions/content-drafts] reviewContentDraft failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save that review — please try again." };
  }
}

import "server-only";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { withParentContext } from "@/db";
import {
  sessionLog,
  domainMastery,
  rewardEvents,
  rewardSettings,
  writingEvaluations,
  mathItems,
  readingPassages,
  children,
  sourceDocuments,
  sourceChunks,
  sourceTopics,
  contentDrafts,
} from "@/db/schema";
import { requireParentId, requireChild } from "@/lib/data/dal";

export type SessionLogRow = typeof sessionLog.$inferSelect;
export type RewardEventRow = typeof rewardEvents.$inferSelect;
export type RewardSettingsRow = typeof rewardSettings.$inferSelect;
export type WritingEvaluationRow = typeof writingEvaluations.$inferSelect;

/** Session log entries for one child from `since` onward (defaults to 7 days back). */
export async function getSessionLog(childId: string, days = 7): Promise<SessionLogRow[]> {
  const child = await requireChild(childId);
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return withParentContext(child.parentId, (tx) =>
    tx
      .select()
      .from(sessionLog)
      .where(and(eq(sessionLog.childId, childId), gte(sessionLog.at, since)))
      .orderBy(sessionLog.at)
  );
}

export async function getMasteryForOverview(childId: string) {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) => tx.select().from(domainMastery).where(eq(domainMastery.childId, childId)));
}

/** Ensures a reward_settings row exists for this parent, then returns it. */
export async function getRewardSettings(): Promise<RewardSettingsRow> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    const rows = await tx.select().from(rewardSettings).where(eq(rewardSettings.parentId, parentId));
    if (rows[0]) return rows[0];
    const inserted = await tx.insert(rewardSettings).values({ parentId }).returning();
    return inserted[0];
  });
}

export async function getRewardEvents(childId: string, limit = 10): Promise<RewardEventRow[]> {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) =>
    tx.select().from(rewardEvents).where(eq(rewardEvents.childId, childId)).orderBy(desc(rewardEvents.at)).limit(limit)
  );
}

/** Current point balance = sum(earned) - sum(redeemed), computed in SQL. */
export async function getRewardBalance(childId: string): Promise<number> {
  const child = await requireChild(childId);
  const rows = await withParentContext(child.parentId, (tx) => tx.select().from(rewardEvents).where(eq(rewardEvents.childId, childId)));
  return rows.reduce((sum, e) => sum + (e.kind === "earned" ? e.points : -e.points), 0);
}

export async function getEvaluations(childId?: string): Promise<WritingEvaluationRow[]> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    // Evaluations are child-scoped, not parent-scoped directly — join through
    // children so RLS's writing_evaluations_owner policy applies, and so a
    // childId filter (when given) can't be used to probe another family's data:
    // requireChild() below re-verifies ownership before we ever filter by it.
    if (childId) {
      await requireChild(childId);
      return tx.select().from(writingEvaluations).where(eq(writingEvaluations.childId, childId)).orderBy(desc(writingEvaluations.at));
    }
    const owned = await tx.select({ id: children.id }).from(children).where(eq(children.parentId, parentId));
    const ids = new Set(owned.map((c) => c.id));
    const all = await tx.select().from(writingEvaluations).orderBy(desc(writingEvaluations.at));
    return all.filter((e) => ids.has(e.childId));
  });
}

/** The family's own custom math questions (parentId = this parent), for the content bank list. */
export async function getOwnMathItems() {
  const parentId = await requireParentId();
  return withParentContext(parentId, (tx) => tx.select().from(mathItems).where(eq(mathItems.parentId, parentId)).orderBy(desc(mathItems.createdAt)));
}

export async function getReadingPassageTitles() {
  const parentId = await requireParentId();
  return withParentContext(parentId, (tx) => tx.select({ id: readingPassages.id, title: readingPassages.title }).from(readingPassages));
}

export interface SourceDocumentRow {
  id: string;
  title: string;
  grade: number;
  subject: string;
  domain: string | null;
  source: string; // 'drive' | 'upload'
  pageCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  createdAt: Date;
}

/** Imported PDFs (docs/architecture/rag-content-pipeline.md, Stage 1) with their chunk counts, newest first. */
export async function getSourceDocuments(): Promise<SourceDocumentRow[]> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    const docs = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.parentId, parentId)).orderBy(desc(sourceDocuments.createdAt));
    if (docs.length === 0) return [];

    // sourceChunks has no parentId of its own — RLS scopes it via the join
    // to sourceDocuments (see migrations/0007_source_content.sql), so this
    // plain groupBy already only sees this parent's own chunks.
    const chunkCounts = await tx
      .select({
        sourceDocumentId: sourceChunks.sourceDocumentId,
        total: count(),
        embedded: count(sourceChunks.embedding),
      })
      .from(sourceChunks)
      .groupBy(sourceChunks.sourceDocumentId);
    const countsById = new Map(chunkCounts.map((c) => [c.sourceDocumentId, c]));

    return docs.map((d) => {
      const c = countsById.get(d.id);
      return {
        id: d.id,
        title: d.title,
        grade: d.grade,
        subject: d.subject,
        domain: d.domain,
        source: d.source,
        pageCount: d.pageCount,
        chunkCount: c?.total ?? 0,
        embeddedChunkCount: c?.embedded ?? 0,
        createdAt: d.createdAt,
      };
    });
  });
}

export interface SourceTopicRow {
  id: string;
  sourceDocumentId: string;
  label: string;
  description: string;
  pageRanges: string[];
}

/**
 * Every already-extracted "table of contents" entry across this parent's
 * imported PDFs (src/lib/actions/source-topics.ts), so the Generate tab can
 * show a document's topics immediately without a round trip — the "Find
 * topics" action only has to run for a document that has none yet.
 */
export async function getSourceTopics(): Promise<SourceTopicRow[]> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    // sourceTopics has no parentId of its own — RLS scopes it via the join
    // to sourceDocuments (see migrations/0010_source_topics.sql), so this
    // plain select already only sees this parent's own topics.
    const topics = await tx.select().from(sourceTopics).orderBy(sourceTopics.createdAt);
    if (topics.length === 0) return [];

    const allChunkIds = Array.from(new Set(topics.flatMap((t) => t.chunkIds as string[])));
    const chunkRows = allChunkIds.length
      ? await tx.select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange }).from(sourceChunks).where(inArray(sourceChunks.id, allChunkIds))
      : [];
    const pageById = new Map(chunkRows.map((c) => [c.id, c.pageRange]));

    return topics.map((t) => ({
      id: t.id,
      sourceDocumentId: t.sourceDocumentId,
      label: t.label,
      description: t.description,
      pageRanges: (t.chunkIds as string[]).map((id) => pageById.get(id)).filter((p): p is string => Boolean(p)),
    }));
  });
}

export interface ContentDraftRow {
  id: string;
  kind: string; // 'math_item' | 'reading_passage'
  payload: Record<string, unknown>;
  status: string; // 'pending' | 'approved' | 'discarded'
  citedPages: string[];
  sourceTitle: string | null;
  createdAt: Date;
}

/**
 * AI-generated drafts (docs/architecture/rag-content-pipeline.md, Stage 3),
 * newest first, with their source citation resolved (which PDF, which
 * page(s)) for the review queue UI. RLS already scopes source_chunks and
 * source_documents to this parent, same as getSourceDocuments above.
 */
export async function getContentDrafts(): Promise<ContentDraftRow[]> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    const drafts = await tx.select().from(contentDrafts).where(eq(contentDrafts.parentId, parentId)).orderBy(desc(contentDrafts.createdAt));
    if (drafts.length === 0) return [];

    const allChunkIds = Array.from(new Set(drafts.flatMap((d) => d.sourceChunkIds as string[])));
    const chunkRows = allChunkIds.length
      ? await tx
          .select({ id: sourceChunks.id, pageRange: sourceChunks.pageRange, docId: sourceChunks.sourceDocumentId })
          .from(sourceChunks)
          .where(inArray(sourceChunks.id, allChunkIds))
      : [];
    const chunkById = new Map(chunkRows.map((c) => [c.id, c]));

    const docIds = Array.from(new Set(chunkRows.map((c) => c.docId)));
    const docRows = docIds.length
      ? await tx.select({ id: sourceDocuments.id, title: sourceDocuments.title }).from(sourceDocuments).where(inArray(sourceDocuments.id, docIds))
      : [];
    const titleByDocId = new Map(docRows.map((d) => [d.id, d.title]));

    return drafts.map((d) => {
      const chunkIds = d.sourceChunkIds as string[];
      const resolvedChunks = chunkIds.map((id) => chunkById.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
      return {
        id: d.id,
        kind: d.kind,
        payload: d.payload as Record<string, unknown>,
        status: d.status,
        citedPages: resolvedChunks.map((c) => c.pageRange),
        sourceTitle: resolvedChunks[0] ? (titleByDocId.get(resolvedChunks[0].docId) ?? null) : null,
        createdAt: d.createdAt,
      };
    });
  });
}

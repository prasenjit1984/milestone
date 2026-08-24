import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { withParentContext } from "@/db";
import { mathItems, readingPassages, domainMastery } from "@/db/schema";
import { requireChild } from "@/lib/data/dal";

export type MathItem = typeof mathItems.$inferSelect;
export type ReadingPassage = typeof readingPassages.$inferSelect;
export type MasteryRow = typeof domainMastery.$inferSelect;

/**
 * The math question pool a child can draw from: every shared (parentId
 * IS NULL) seed-bank item for their grade, plus any custom questions their
 * own family has authored via Parent Mode's content editor. RLS's
 * math_items_read policy already enforces "shared or mine" at the database
 * layer — this just adds the grade filter on top.
 */
export async function getMathPool(childId: string): Promise<MathItem[]> {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) =>
    tx
      .select()
      .from(mathItems)
      .where(and(eq(mathItems.grade, child.grade), or(isNull(mathItems.parentId), eq(mathItems.parentId, child.parentId))))
  );
}

export async function getReadingPassages(childId: string): Promise<ReadingPassage[]> {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) =>
    tx
      .select()
      .from(readingPassages)
      .where(and(eq(readingPassages.grade, child.grade), or(isNull(readingPassages.parentId), eq(readingPassages.parentId, child.parentId))))
  );
}

export async function getMasteryForChild(childId: string): Promise<MasteryRow[]> {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) => tx.select().from(domainMastery).where(eq(domainMastery.childId, childId)));
}

export function masteryLevel(mastery: MasteryRow[], subject: string, domain: string): number {
  return mastery.find((m) => m.subject === subject && m.domain === domain)?.level ?? 2;
}

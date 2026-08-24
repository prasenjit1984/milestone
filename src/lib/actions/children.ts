"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { withParentContext } from "@/db";
import { children } from "@/db/schema";
import { requireParentModeUnlocked, requireChild } from "@/lib/data/dal";

// Practice content (math items, reading passages) only exists for grades 2
// and 4 today — restricting profile grades to the same set avoids a kid
// landing on an empty practice screen. Widen this once more grade content
// is authored.
const ChildInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  grade: z.union([z.literal(2), z.literal(4)]),
  emoji: z.string().trim().min(1).max(8),
});

export type ChildInput = z.infer<typeof ChildInputSchema>;

/** Parent-only: creates a new child profile under this family. */
export async function createChild(input: ChildInput): Promise<{ id: string }> {
  const parentId = await requireParentModeUnlocked();
  const parsed = ChildInputSchema.parse(input);
  const inserted = await withParentContext(parentId, (tx) =>
    tx
      .insert(children)
      .values({ parentId, name: parsed.name, grade: parsed.grade, emoji: parsed.emoji })
      .returning({ id: children.id })
  );
  return { id: inserted[0].id };
}

const UpdateChildSchema = ChildInputSchema.extend({ childId: z.string().uuid() });
export type UpdateChildInput = z.infer<typeof UpdateChildSchema>;

/** Parent-only: edits an existing child's display name, grade, or avatar. */
export async function updateChild(input: UpdateChildInput): Promise<void> {
  await requireParentModeUnlocked();
  const parsed = UpdateChildSchema.parse(input);
  const child = await requireChild(parsed.childId); // re-verifies ownership (IDOR guard)
  await withParentContext(child.parentId, (tx) =>
    tx
      .update(children)
      .set({ name: parsed.name, grade: parsed.grade, emoji: parsed.emoji })
      .where(eq(children.id, parsed.childId))
  );
}

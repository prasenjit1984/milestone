import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getSession, isParentModeUnlocked } from "@/lib/auth/session";
import { db, withParentContext } from "@/db";
import { parents, children } from "@/db/schema";

/**
 * Verifies the parent session cookie and returns the parent id, or redirects
 * to /login. Call this at the top of every parent- or child-scoped Server
 * Component, Server Action, and Route Handler — a page-level redirect does
 * NOT protect Server Actions defined elsewhere, so each entry point
 * re-verifies independently (see Next.js Data Security guide).
 */
export const requireParentId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session.parentId) {
    redirect("/login");
  }
  return session.parentId;
});

export interface CurrentParent {
  id: string;
  name: string;
  email: string;
}

/** Minimal, safe-to-render parent record (no password/PIN hashes). */
export const getCurrentParent = cache(async (): Promise<CurrentParent> => {
  const parentId = await requireParentId();
  const rows = await withParentContext(parentId, (tx) =>
    tx.select({ id: parents.id, name: parents.name, email: parents.email }).from(parents).where(eq(parents.id, parentId))
  );
  const parent = rows[0];
  if (!parent) redirect("/login");
  return parent;
});

/**
 * Gates access to the Parent Mode dashboard specifically. The parent must
 * already have a valid top-level session AND have entered the Parent Mode
 * PIN within the last 20 minutes (see session.ts). Redirects to /parent/gate
 * otherwise.
 */
export async function requireParentModeUnlocked(): Promise<string> {
  const parentId = await requireParentId();
  const unlocked = await isParentModeUnlocked();
  if (!unlocked) {
    redirect("/parent/gate");
  }
  return parentId;
}

export interface OwnedChild {
  id: string;
  parentId: string;
  name: string;
  grade: number;
  emoji: string;
  colorVar: string;
  leftoverMinutes: number;
}

/**
 * Verifies the given childId belongs to the signed-in parent (prevents an
 * Insecure Direct Object Reference — a family guessing/reusing another
 * family's child id in the URL) and returns the child record, or redirects.
 */
export async function requireChild(childId: string): Promise<OwnedChild> {
  const parentId = await requireParentId();
  const rows = await withParentContext(parentId, (tx) =>
    tx.select().from(children).where(and(eq(children.id, childId), eq(children.parentId, parentId)))
  );
  const child = rows[0];
  if (!child) redirect("/profiles");
  return child;
}

export async function listChildren(): Promise<OwnedChild[]> {
  const parentId = await requireParentId();
  return withParentContext(parentId, (tx) => tx.select().from(children).where(eq(children.parentId, parentId)));
}

// Re-exported for modules that need a plain (non-parent-scoped) db handle,
// e.g. reading the shared seed content bank. Never used for parent- or
// child-owned rows — those always go through withParentContext.
export { db };

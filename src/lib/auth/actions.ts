"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db, withParentContext } from "@/db";
import { parents } from "@/db/schema";
import { verifyPassword, verifyPin } from "@/lib/auth/passwords";
import { getSession, unlockParentMode, lockParentMode } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { requireParentId } from "@/lib/data/dal";

// Fixed, precomputed bcrypt hash of an unrelated constant string. When no
// account matches the submitted email, we still run verifyPassword against
// this so a login attempt against an unknown email takes roughly the same
// time as one against a real (wrong-password) account — a cheap defense
// against timing-based user enumeration. Never used to actually authenticate.
const DUMMY_HASH = "$2b$12$gjuFrZzkohaIL3pMeTLWQeSFIXOyFPkX6UNPn9IFWlmcVv5KeGNTq";

async function requestKey(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Enter your password." }),
});

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;

  const ip = await requestKey();
  const limited = checkRateLimit(`login:${ip}`, 10, 10 * 60 * 1000);
  if (!limited.ok) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Plain `db.select().from(parents).where(eq(parents.email, ...))` would
  // return zero rows here no matter what: as app_user, RLS's parents_self
  // policy requires id = app_current_parent_id(), and there's no parentId
  // to set as context yet — that's exactly what we're trying to look up.
  // auth_lookup_parent() (migrations/0003_auth_lookup.sql) is a narrow
  // SECURITY DEFINER function that bypasses RLS for only this one lookup.
  const rows = await db.execute<{ id: string; password_hash: string }>(sql`select * from auth_lookup_parent(${email})`);
  const parent = rows[0];
  const validPassword = await verifyPassword(password, parent?.password_hash ?? DUMMY_HASH);

  if (!parent || !validPassword) {
    return { error: "Incorrect email or password." };
  }

  const session = await getSession();
  session.parentId = parent.id;
  session.parentUnlockedAt = undefined;
  await session.save();
  redirect("/profiles");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  await session.save();
  redirect("/login");
}

const PinSchema = z.object({
  pin: z.string().trim().min(4, { error: "PIN must be at least 4 digits." }).max(8, { error: "PIN must be at most 8 digits." }),
});

export type PinState = { error?: string } | undefined;

export async function unlockParentModeAction(_prevState: PinState, formData: FormData): Promise<PinState> {
  const parentId = await requireParentId();
  const parsed = PinSchema.safeParse({ pin: formData.get("pin") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your PIN." };
  }

  const ip = await requestKey();
  const limited = checkRateLimit(`pin:${ip}:${parentId}`, 10, 10 * 60 * 1000);
  if (!limited.ok) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Unlike the login lookup above, parentId here already comes from a
  // verified session (requireParentId), so the normal RLS path applies.
  const rows = await withParentContext(parentId, (tx) =>
    tx.select({ parentPinHash: parents.parentPinHash }).from(parents).where(eq(parents.id, parentId))
  );
  const parent = rows[0];
  if (!parent) redirect("/login");

  const validPin = await verifyPin(parsed.data.pin, parent.parentPinHash);
  if (!validPin) {
    return { error: "Incorrect PIN." };
  }

  await unlockParentMode();
  redirect("/parent");
}

export async function lockParentModeAction() {
  await requireParentId();
  await lockParentMode();
  redirect("/profiles");
}

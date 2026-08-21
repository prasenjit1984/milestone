import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";

// Minimal session payload only — no email, no PII. Look the parent up by id
// when you need more (see src/lib/data/dal.ts), so a leaked/old cookie can't
// itself reveal anything about the account.
export interface SessionData {
  parentId?: string;
  /** epoch ms when the Parent Mode PIN was last entered successfully. */
  parentUnlockedAt?: number;
}

declare module "iron-session" {
  // This is TS's standard module-augmentation pattern for merging
  // declarations (see iron-session's own docs); it only looks "empty"
  // because SessionData supplies all the members.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IronSessionData extends SessionData {}
}

const PARENT_UNLOCK_TTL_MS = 20 * 60 * 1000; // 20 minutes of Parent Mode access per PIN entry

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a string of at least 32 characters.");
  }
  return secret;
}

export function sessionOptions() {
  return {
    password: sessionSecret(),
    cookieName: "milestone_session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days — this is the "stay logged in on the family device" session
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export async function isParentModeUnlocked(): Promise<boolean> {
  const session = await getSession();
  if (!session.parentUnlockedAt) return false;
  return Date.now() - session.parentUnlockedAt < PARENT_UNLOCK_TTL_MS;
}

export async function unlockParentMode() {
  const session = await getSession();
  session.parentUnlockedAt = Date.now();
  await session.save();
}

export async function lockParentMode() {
  const session = await getSession();
  session.parentUnlockedAt = undefined;
  await session.save();
}

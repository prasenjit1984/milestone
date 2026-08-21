import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and configure it.");
}

// A small pool is plenty for this app's traffic. `prepare: false` keeps us
// compatible with connection poolers (e.g. Neon's pooled connection string).
const client = postgres(connectionString, { prepare: false, max: 10 });

export const db = drizzle(client, { schema });

/**
 * Runs `fn` inside a transaction with the Postgres session variable
 * `app.current_parent_id` set for the duration of that transaction. The RLS
 * policies in migrations/0001_rls.sql key off this variable, so every
 * parent-scoped query MUST go through this helper — it is the enforcement
 * point that makes cross-family data access fail at the database layer even
 * if an application-level WHERE clause is ever missing or wrong.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withParentContext<T>(parentId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(parentId)) {
    throw new Error("withParentContext: parentId is not a valid UUID");
  }
  return db.transaction(async (tx) => {
    // Parameterized (not string-interpolated) even though parentId is already
    // validated above — belt and suspenders for anything touching RLS context.
    await tx.execute(sql`select set_config('app.current_parent_id', ${parentId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}

// Applies every .sql file in src/db/migrations, in filename order, tracking
// what's already been applied in a `_migrations_applied` bookkeeping table so
// re-runs are safe. Runs against MIGRATIONS_DATABASE_URL (the schema-owning
// role), never DATABASE_URL (the restricted app_user role) — app_user can't
// ALTER TABLE, CREATE POLICY, etc. by design.
//
// Drizzle-generated migrations (0000_*.sql, and future `pnpm db:generate`
// output) and hand-written ones (0001_rls.sql) both live in the same folder
// and are treated the same way here — this project intentionally does not
// depend on drizzle-kit's own migration journal, since it can't represent a
// hand-authored RLS migration cleanly.
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.MIGRATIONS_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set MIGRATIONS_DATABASE_URL (or DATABASE_URL) before running migrations.");
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../src/db/migrations");

async function main() {
  const sql = postgres(url, { max: 1 });

  await sql`create table if not exists _migrations_applied (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = await sql`select filename from _migrations_applied`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log("skip (already applied):", file);
      continue;
    }
    console.log("applying:", file);
    const content = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    await sql.begin(async (tx) => {
      for (const stmt of statements) {
        await tx.unsafe(stmt);
      }
      await tx`insert into _migrations_applied (filename) values (${file})`;
    });
  }

  console.log("Migrations up to date.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# Architecture decisions

The original plan (`milestone-plan.html`, reproduced in
[`docs/requirements/`](../requirements/)) proposed a specific tech stack: React +
Vite, Supabase (Postgres + Auth), Vercel. Building against a real Next.js 16
codebase surfaced reasons to deviate from a few of those choices, and to make some
decisions the plan left open. This log exists so a future contributor (or a future
session) doesn't have to re-derive the "why."

## Next.js (App Router) instead of React + Vite

The plan's frontend choice was React + TypeScript + Vite. The build instead uses
Next.js 16 with the App Router. Reasoning: the plan's own architecture already wants
server-side logic that never reaches the browser (the Anthropic API key, database
credentials) and a real backend data layer (Postgres, not static files) — Next.js's
Server Components and Server Actions give that for free, colocated with the UI,
without standing up a separate API server. Vite would have needed a hand-rolled
backend (Express/Fastify or serverless functions) to get the same server/client
split; Next.js's App Router is that split as a first-class framework feature.

Two Next.js 16-specific things worth knowing if you've used an older version:

- `middleware.ts` is renamed `proxy.ts` and runs on the Node.js runtime by default
  (not the Edge runtime) — this project's `src/proxy.ts` relies on that, since
  `iron-session` and `bcryptjs` are not Edge-safe.
- `cookies()`, `headers()`, route `params`, and `searchParams` are fully async-only.

## Neon instead of Supabase

The plan specified Supabase (Postgres + Auth) as the backend. The actual build uses
**Neon** (serverless Postgres) with hand-rolled auth (`iron-session` + `bcryptjs`)
instead of Supabase Auth. This was an explicit choice made with the user at the
start of this build phase, not a default. Reasoning:

- Supabase Auth is built around enabling self-serve sign-up flows (email
  verification, magic links, OAuth providers) that this app deliberately has none
  of — there is exactly one hand-created account, ever. A thinner, purpose-built
  session layer (`iron-session`, an encrypted cookie) is a better fit for "one
  password, one PIN, no sign-up" than adopting a full auth platform for a single
  row in a `parents` table.
- Neon's branching model and Vercel-first serverless Postgres story pair well with
  a Vercel deployment, and its free tier covers this app's traffic the same way
  Supabase's would have.
- Row-Level Security — the actual requirement from the plan's security section — is
  a Postgres feature, not a Supabase feature; it works identically on Neon. Nothing
  about the RLS design in `docs/architecture/auth-and-security.md` depends on
  Supabase.

The tradeoff: Supabase Auth would have included rate limiting and password-strength
policy out of the box. This build's own rate limiter
(`src/lib/auth/rate-limit.ts`) is intentionally documented as a budget-tier, single-
instance defense rather than a claimed equivalent — see that file's own comments and
`docs/architecture/auth-and-security.md`.

## Drizzle ORM with a hand-maintained migration runner, not `drizzle-kit migrate`

`drizzle-kit generate` is still used to diff schema changes into SQL
(`pnpm db:generate`), but migrations are applied by a small custom script
(`scripts/migrate.mjs`) rather than `drizzle-kit migrate`. Reason: the Row-Level
Security migration (`0001_rls.sql`) is hand-written SQL — `CREATE POLICY`,
`ALTER TABLE ... FORCE ROW LEVEL SECURITY`, a helper SQL function — which doesn't
fit cleanly into drizzle-kit's own schema-diffing journal. `scripts/migrate.mjs`
treats every `.sql` file in `src/db/migrations/` the same way regardless of how it
was produced (generated or hand-written), tracking what's applied in a
`_migrations_applied` bookkeeping table.

## `next/font/local` (via `@fontsource`) instead of `next/font/google`

The plan didn't specify a font-loading strategy. `next/font/google` was tried
first, since it self-hosts the served font files (no runtime browser requests to
Google) — but it still **fetches the font files from Google at build/dev time**,
which fails in any network-restricted build environment. Switched to
`next/font/local` pointed at the `@fontsource/*` npm packages, which vendor the
same static `.woff2` files as an installable dependency. Same end result (one
self-hosted font, one strict same-origin CSP, no runtime request to Google) with no
network dependency at build time at all — see `src/lib/fonts.ts`.

## Nonce-based CSP via `proxy.ts`, forcing dynamic rendering everywhere

Not specified in the plan. Chosen because the whole app is personalized and
auth-gated by nature — there's no page that benefits from static generation or a
CDN cache — so the tradeoff nonce-based CSP normally forces (no static rendering)
costs nothing here, in exchange for a materially stricter `script-src` than a
static CSP in `next.config.ts` could offer (`'unsafe-inline'` would otherwise be
required for `next-themes`'s injected script; the nonce approach avoids that
entirely — see `docs/architecture/auth-and-security.md`).

## Removed at build time: two vendored shadcn/ui components

The initial component vendoring pass (worked around a sandboxed environment's
network block on `ui.shadcn.com` by extracting a pre-bundled component set) included
`calendar.tsx` and `resizable.tsx`. Both had TypeScript API mismatches against the
actual installed versions of their underlying packages (`react-day-picker`,
`react-resizable-panels`) and were not used anywhere in the app. Removed both files
and their now-dead dependencies rather than fixing unused, broken code — re-add
either (matching the current package versions' actual API) if a feature needs a
date picker or resizable panel layout.

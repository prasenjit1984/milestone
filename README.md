# Milestone

A browser-based, iPad-and-laptop practice app for two kids — grade 2 and grade 4 —
covering Math and Reading & Writing, tagged to Georgia's official K-12 Standards
(GCPS AKS-aligned), with an AI evaluator behind the scenes that grades written
answers like a patient teacher would. One parent login, no public sign-up, two
independently-tracked kid profiles underneath it.



Full functional and business requirements live in [`docs/`](./docs/) — start with
[`docs/requirements/product-requirements.md`](./docs/requirements/product-requirements.md).
This README covers the technical side: architecture, stack, and how to run it.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) | Server Components/Actions colocate the server-only logic (DB access, the Anthropic API key) with the UI, no separate API server |
| Language | TypeScript | |
| UI | React 19, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com) primitives (vendored) | |
| Fonts | `next/font/local` via `@fontsource/*` | fully self-hosted, no network dependency at build time — see [`docs/architecture/decisions.md`](./docs/architecture/decisions.md) |
| Database | [Neon](https://neon.tech) (serverless Postgres) | free tier, branching, pairs with Vercel |
| ORM / migrations | [Drizzle ORM](https://orm.drizzle.team) + a hand-maintained SQL migration runner | needed to support a hand-written Row-Level Security migration — see decisions doc |
| Data access control | Postgres **Row-Level Security**, enforced via a dedicated non-superuser `app_user` role | see [`docs/architecture/auth-and-security.md`](./docs/architecture/auth-and-security.md) |
| Auth | [`iron-session`](https://github.com/vvo/iron-session) (encrypted cookie) + `bcryptjs` | one parent account, no public sign-up; a second short PIN gates Parent Mode |
| AI evaluation | [Claude Haiku](https://www.anthropic.com) via `@anthropic-ai/sdk`, server-side only | grades written responses (`src/lib/ai/evaluate.ts`) and writes the weekly parent summary (`src/lib/ai/weekly-read.ts`) — degrades gracefully to an honest "not configured yet" state if `ANTHROPIC_API_KEY` is unset, never a faked grade |
| PWA | `app/manifest.ts`, a hand-rolled `public/sw.js` service worker, generated app icons | installable on iPad/laptop |
| Hosting (target) | [Vercel](https://vercel.com) | free tier, automatic HTTPS, one-command deploy |

## Architecture

```
Browser
  │
  ▼
src/proxy.ts  ── per-request nonce CSP + optimistic auth redirect (Node.js runtime)
  │
  ▼
Next.js App Router (src/app/**)
  ├─ Server Components — render pages, call the Data Access Layer directly
  ├─ Server Actions (src/lib/auth/actions.ts, …) — all mutations
  └─ Route Handlers — none yet; the AI evaluation call will likely live here
  │
  ▼
src/lib/data/dal.ts  ── Data Access Layer: every auth/ownership check funnels
                         through here (requireParentId, requireChild, …).
                         This is the REAL enforcement boundary — proxy.ts is a
                         UX optimization only, never the security boundary.
  │
  ▼
src/db/index.ts: withParentContext()  ── sets a Postgres session variable per
                                          transaction so Row-Level Security
                                          applies to every parent-scoped query
  │
  ▼
Neon Postgres  ── RLS enforces family isolation at the database layer, so even
                   a missing WHERE clause in application code can't leak data
```

The full request-flow diagram, the two-Postgres-role RLS design, session/PIN
handling, CSP details, and IDOR protection are documented (and were verified
end-to-end against a real database and a real browser) in
[`docs/architecture/auth-and-security.md`](./docs/architecture/auth-and-security.md).
The complete table-by-table schema is in
[`docs/architecture/data-model.md`](./docs/architecture/data-model.md).

### Directory guide

```
src/app/                  Routes (App Router) — pages only, no business logic
src/components/           React components; src/components/ui/ is vendored shadcn/ui
src/lib/auth/             Session (iron-session), password/PIN hashing, rate limiting,
                           and the auth Server Actions (login, logout, PIN unlock)
src/lib/data/dal.ts        The Data Access Layer — the real authorization boundary
src/lib/fonts.ts           Self-hosted font setup
src/db/                    Drizzle schema, the withParentContext() RLS helper,
                           hand-tracked SQL migrations, one-time role setup script
scripts/                  migrate.mjs, seed.ts, generate-icons.mjs — all standalone,
                           deliberately not importing server-only-marked app code
                           (see comments in scripts/seed.ts for why)
docs/                     Requirements and architecture documentation (see docs/README.md)
```

## Getting started (local development)

Requires Node 20+, pnpm, and a local Postgres 16 instance.

```bash
pnpm install

# 1. Create a database and a migration-owner connection, then an app_user role:
createdb milestone
# set DATABASE_URL / MIGRATIONS_DATABASE_URL / SESSION_SECRET in .env.local
# (see .env.example for the format and how to generate SESSION_SECRET)

pnpm db:migrate      # applies every file in src/db/migrations/, in order
psql "$MIGRATIONS_DATABASE_URL" -f src/db/setup-app-role.sql   # grants app_user its RLS-scoped privileges

pnpm db:seed         # creates the one parent account + two kid profiles + seed content
pnpm icons:generate  # only needed once, or after editing scripts/generate-icons.mjs

pnpm dev             # http://localhost:3000
```

The seed script prints the parent's login credentials (or set
`SEED_PARENT_EMAIL` / `SEED_PARENT_PASSWORD` / `SEED_PARENT_PIN` to choose your
own before running it). `ANTHROPIC_API_KEY` can stay unset locally — the app is
meant to degrade gracefully wherever the AI evaluation module lands, rather than
silently mocking it.

Other scripts:

```bash
pnpm lint            # eslint
pnpm build            # production build (also type-checks)
pnpm db:generate      # drizzle-kit generate — diffs schema.ts into a new migration file
pnpm db:studio        # drizzle-kit's DB browser
```

## Deployment (target: Vercel + Neon)

1. Create a Neon project and database. Use its pooled connection string as
   `DATABASE_URL`'s *base* — but see step 3, `app_user` is a separate role from
   whatever Neon gives you by default.
2. Run `pnpm db:migrate` against Neon's connection string as
   `MIGRATIONS_DATABASE_URL` (a role with schema-owner privileges — Neon's default
   role works for this).
3. Create the `app_user` role from Neon's console (Roles tab — it generates and
   stores the password), then run `src/db/setup-app-role.sql` against the database
   to grant it exactly the privileges it needs. Use `app_user`'s connection string
   as `DATABASE_URL`.
4. Set `SESSION_SECRET` (generate with `openssl rand -base64 32`) and
   `ANTHROPIC_API_KEY` as Vercel environment variables — never commit either.
5. Run `pnpm db:seed` once (locally, pointed at the production `DATABASE_URL`/
   `MIGRATIONS_DATABASE_URL` pair, or via a one-off Vercel deployment shell) to
   create the real parent account. Don't leave the seed script's default dev
   password in place for a real deployment — set `SEED_PARENT_PASSWORD` /
   `SEED_PARENT_PIN` explicitly.
6. Deploy. `next.config.ts` and `src/proxy.ts` already set the security headers and
   nonce-based CSP described in `docs/architecture/auth-and-security.md`; Vercel's
   Hobby tier covers HTTPS and basic DDoS/WAF protection for free (see
   `docs/requirements/security-requirements.md`).

## Project status

Live in production at [milestone-woad-beta.vercel.app](https://milestone-woad-beta.vercel.app),
backed by Neon Postgres and deployed from this repo's `main` branch via Vercel's
GitHub integration. Every area of the product-requirements spec is built and
has been exercised end-to-end against the real production database and a real
browser:

- **Foundation** — project scaffold, Tailwind v4 + vendored shadcn/ui, PWA
  manifest/icons/service worker, the full Postgres schema, Row-Level Security
  (two-role design), and parent authentication (login, session, the Parent
  Mode PIN gate, logout, IDOR protection on child-scoped routes).
- **Kid-facing math practice** (`src/components/kid/math-practice.tsx`) —
  domain/topic sidebar picker (Numerical Reasoning, Patterning & Algebraic
  Reasoning, Measurement & Data Reasoning, Geometric & Spatial Reasoning),
  streak-based adaptive difficulty per domain, and a session-length control
  that supports three modes: by time (5–60 min), by question count (5–30,
  5-question steps), and a count-mode session with an optional time-boxed
  efficiency goal — a draggable clock dial (1–60 min) sets a target, and
  going over it flips the on-screen clock to a red count-up instead of
  ending the session early.
- **Kid-facing reading practice** (`src/components/kid/reading-practice.tsx`) —
  a topic-picker sidebar (fiction, science, geography, history,
  social-studies) mirroring the math domain picker, a widened responsive
  2-column passage layout that fits most passages on screen without
  scrolling, multiple-choice comprehension checks, and AI-graded summary/
  opinion writing prompts.
- **Parent Mode dashboard** (`src/components/parent/`) — Overview (time
  practiced, accuracy by domain, timed-attempt goals, AI weekly read per
  kid), Content (add/edit/retire custom math questions and reading
  passages), Evaluations (per-response AI writing feedback, browsable by
  kid and session), Rewards (minutes-per-point / points-per-dollar settings,
  redeem flow), and Profiles (add/edit kid name, grade, avatar).
- **Rewards module** (`src/lib/actions/rewards.ts`) — points tied to
  practice time, parent-configurable rate, on/off switch, append-only ledger,
  and a kid-facing running-total view.
- **AI evaluation** (`src/lib/ai/evaluate.ts`, `src/lib/ai/weekly-read.ts`) —
  Claude Haiku grades written responses and writes the weekly per-kid
  summary shown in Overview; degrades gracefully to an honest
  "not configured yet" state if `ANTHROPIC_API_KEY` is unset, rather than
  faking a grade.

See [`docs/requirements/product-requirements.md`](./docs/requirements/product-requirements.md)
for the full spec, and [`docs/architecture/data-model.md`](./docs/architecture/data-model.md)
for the current table-by-table schema.

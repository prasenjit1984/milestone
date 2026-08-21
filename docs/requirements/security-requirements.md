# Security & budget requirements

Milestone has no payment data, and the only personal information involved is two
kids' first names and grade levels. The realistic threats are narrow — a guessed
password, a leaked secret key, a stale dependency with a known hole — and the
requirement is to cover those threats at effectively no cost, not to defend against
a nation-state.

## Required security layers

| Layer | Requirement | How it's satisfied (see `docs/architecture/auth-and-security.md`) |
|---|---|---|
| Transport | HTTPS everywhere, automatic | Vercel issues and renews the TLS certificate for free |
| Network | DDoS mitigation / WAF on by default | Included free on Vercel's Hobby tier |
| Data access | Database-enforced access control — a bug in application code must not be able to leak one family's data to another | Postgres Row-Level Security, enforced via a non-superuser `app_user` role (not just policy text — see the architecture doc for why RLS alone is not enough) |
| Secrets | Any privileged/service credential stays server-side always — never shipped to the browser or committed to the repo | `ANTHROPIC_API_KEY`, `DATABASE_URL`, `MIGRATIONS_DATABASE_URL`, `SESSION_SECRET` are server-only env vars, read only in `server-only`-marked modules |
| Sign-up | No public sign-up — the parent account is hand-created | No signup route exists anywhere in the app; accounts are created only via `scripts/seed.ts` or direct DB access |
| Login | Strong password + rate limiting; a secondary short PIN for the parent-only dashboard | bcrypt-hashed password and PIN (12 salt rounds); in-memory rate limiting on both login and PIN entry (see architecture doc for its limits) |
| Object access | A signed-in family must not be able to view another family's child by guessing/reusing an ID in a URL (IDOR) | Every child-scoped Server Component/Action re-verifies ownership via the Data Access Layer (`requireChild()`) |
| Dependencies | Regular automated dependency check | GitHub Dependabot (once the repo is on GitHub) or a scheduled `npm audit`/`pnpm audit` |

One item the original plan flagged and explicitly deferred: leaked-password
checking against the HaveIBeenPwned database. That was a Supabase Pro-tier feature
in the original (Supabase-based) plan; it doesn't apply to the current
Neon + hand-rolled-auth architecture at all, and isn't worth building for a
two-profile family app regardless.

## Budget

Target: **$0–8/month**, dominated by the one genuinely metered line — AI evaluation
and weekly-read calls.

| Item | Tier | Cost |
|---|---|---|
| Hosting (Vercel) | Free (Hobby) | $0/mo |
| Database (Neon Postgres) | Free tier | $0/mo |
| AI evaluation + weekly reads (Anthropic API, Claude Haiku) | Pay-as-you-go | ~$1–2/mo |
| Custom domain (optional) | — | ~$12/yr |

Claude Haiku is priced per token (roughly $1/million input tokens, $5/million output,
as of the original plan) rather than included free. A single evaluation — a short
passage excerpt, a question, a kid's answer, and grading instructions in; a
structured critique and model answer out — runs well under a thousand tokens each
direction, a fraction of a cent per response. Even a generous 20 written responses a
day across both kids lands under $2/month. This is the one line that scales with
actual use rather than being flat, which is exactly why the AI evaluation module must
stay scoped to written-response items only (§6 of the product requirements) — it
should never touch instant-graded multiple-choice or math items.

Note: the original plan budgeted around Supabase's free tier; the as-built
architecture uses Neon's free tier instead (see
[`docs/architecture/decisions.md`](../architecture/decisions.md)), which has the
same $0/month floor for this app's traffic.

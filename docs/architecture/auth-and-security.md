# Auth & security architecture

This documents how `docs/requirements/security-requirements.md` is actually
satisfied in code. Every claim below points at a real file, and the request-flow
and RLS behavior have both been exercised end-to-end against a real Postgres
database (not asserted from reading the code) — see the verification note at the
bottom.

## Request flow

```
Browser
  │  every request (except _next/static, _next/image, favicon, icons, sw.js)
  ▼
src/proxy.ts                     — runs on Node.js runtime, before rendering
  ├─ generates a per-request nonce, sets a strict nonce-based CSP header
  └─ optimistic redirect: no session cookie + protected route → /login
     (session cookie + /login → /profiles)
  │
  ▼
Server Component / Server Action / Route Handler
  │  MUST independently re-verify auth — proxy.ts is a UX optimization only,
  │  not a security boundary (a Server Action is reachable by direct POST
  │  regardless of proxy.ts's matcher)
  ▼
src/lib/data/dal.ts (Data Access Layer)
  ├─ requireParentId()          — session cookie → parentId, or redirect(/login)
  ├─ requireChild(childId)      — IDOR check: does this child belong to this parent
  └─ requireParentModeUnlocked()— session + PIN unlocked in the last 20 min
  │
  ▼
src/db/index.ts: withParentContext(parentId, fn)
  └─ sets Postgres session var app.current_parent_id for one transaction,
     then runs fn — this is what makes RLS actually apply per request
  │
  ▼
Neon Postgres — Row-Level Security enforces the boundary regardless of whether
                the application code above got the WHERE clause right
```

## Two Postgres roles, not one

A single easy-to-miss fact drove the whole role design: **Postgres superusers
bypass Row-Level Security unconditionally**, and even `ALTER TABLE ... FORCE ROW
LEVEL SECURITY` only affects the table's *owner* — a superuser is exempt from RLS
regardless of FORCE. Testing RLS while connected as a superuser (or the table
owner) would look correct and prove nothing.

So there are two separate connection strings and two separate roles:

- **`app_user`** (`DATABASE_URL`) — a plain `LOGIN` role, not a superuser, not the
  table owner. Every query the running app makes goes through this role, so RLS is
  live for all of it. Provisioned via `src/db/setup-app-role.sql`.
- **The schema owner** (`MIGRATIONS_DATABASE_URL`; `postgres` locally, a
  Neon-provisioned role in production) — runs `scripts/migrate.mjs` and
  `setup-app-role.sql` only. The running app never connects with this role.

## Row-Level Security

`src/db/migrations/0001_rls.sql` enables and **forces** RLS on every table, keyed
off a Postgres session variable, `app.current_parent_id`, read through a small
helper function:

```sql
create or replace function app_current_parent_id() returns uuid as $$
  select nullif(current_setting('app.current_parent_id', true), '')::uuid
$$ language sql stable;
```

`current_setting(..., true)` returns NULL if the variable was never set — so a
connection that forgets to set context is denied by every policy. **Fail closed,
not fail open.**

Every parent- or child-owned table has a policy like:

```sql
create policy children_owner on children
  for all
  using (parent_id = app_current_parent_id())
  with check (parent_id = app_current_parent_id());
```

Child-scoped tables (`domain_mastery`, `session_log`, etc.) join through `children`
to reach the same check. `math_items` and `reading_passages` get a fourth,
read-only policy allowing `parent_id IS NULL` rows (the shared seed content bank) to
be read by anyone, but never written by `app_user` — only an RLS-bypassing
connection (the seed script, run as the schema owner) can write those.

`src/db/index.ts` exports the one function the whole app is required to use for any
parent-scoped query:

```ts
export async function withParentContext<T>(parentId: string, fn: (tx) => Promise<T>): Promise<T> {
  // parentId is validated against a UUID regex first (defense in depth —
  // it's already application-controlled, not raw user input, but cheap to check)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_parent_id', ${parentId}, true)`);
    return fn(tx);
  });
}
```

`set_config` is called through Drizzle's parameterized `sql` tag, not string
interpolation.

### The login chicken-and-egg, and the one deliberate RLS bypass

RLS being fail-closed creates one real problem: the login flow's very first query —
"find the parent row for this email" — has no `parentId` yet to set as context (that
is literally what the query is trying to determine). A plain
`select ... from parents where email = ...` as `app_user` always returns zero rows.

The fix is a narrow `SECURITY DEFINER` Postgres function
(`src/db/migrations/0003_auth_lookup.sql`):

```sql
create or replace function auth_lookup_parent(p_email text)
returns table (id uuid, password_hash text)
language sql stable security definer set search_path = public
as $$ select id, password_hash from parents where email = p_email $$;

revoke all on function auth_lookup_parent(text) from public;
grant execute on function auth_lookup_parent(text) to app_user;
```

`SECURITY DEFINER` runs with the function owner's privileges (bypassing RLS), but
`app_user` only ever gets `EXECUTE` on this one function — not broader `SELECT` on
`parents`. It returns exactly the two columns the login check needs, nothing else
(no PIN hash, no name, no timestamps). This is the **only** RLS bypass reachable
from the running app; everything else goes through `withParentContext`.

## Session & Parent Mode

Two-tier auth, both stored in one `iron-session`-encrypted cookie
(`src/lib/auth/session.ts`):

- **`parentId`** — set on successful login (`src/lib/auth/actions.ts: login()`), a
  30-day cookie. This is the account-level session.
- **`parentUnlockedAt`** — set when the Parent Mode PIN is entered correctly, a
  20-minute rolling TTL checked by `isParentModeUnlocked()`. Gates
  `requireParentModeUnlocked()` in the DAL, which every Parent Mode route must call.

Both password and PIN are bcrypt-hashed at 12 salt rounds
(`src/lib/auth/passwords.ts`). The PIN is a **separate secret** from the account
password — a parent can hand a kid's iPad to Parent Mode entry without exposing the
account password itself.

The login Server Action defends against timing-based user enumeration: when no
account matches the submitted email, it still runs `bcrypt.compare` against a fixed
precomputed dummy hash, so a login attempt against an unknown email takes roughly
the same wall-clock time as one against a real (wrong-password) account.

## CSP & the nonce

`src/proxy.ts` generates a fresh nonce per request and sets a strict
Content-Security-Policy: `script-src 'self' 'nonce-…' 'strict-dynamic'` (plus
`'unsafe-eval'` in dev only, for React's dev-mode error reconstruction). This
requires every page to render dynamically (nonces can't be baked into a statically
generated page) — acceptable here since the entire app is personalized and
auth-gated anyway.

One consequence worth documenting: `next-themes`'s injected inline script (which
avoids a flash of the wrong theme on load) is blocked by this CSP unless it carries
the same nonce. `src/app/layout.tsx` reads `x-nonce` from `headers()` and passes it
to `next-themes`'s `ThemeProvider` via its `nonce` prop — any future inline script
added to the app needs the same treatment or it will be silently blocked in
production.

## IDOR protection

`requireChild(childId)` in `src/lib/data/dal.ts` is called by every child-scoped
route (e.g. `/kid/[childId]`) and re-verifies that the requested `childId` actually
belongs to the signed-in parent, inside `withParentContext` — so RLS enforces it
twice over (once in the DAL's own query, once again for every subsequent
child-scoped query in that request). A parent guessing or reusing another family's
child ID in a URL is redirected to `/profiles`, not shown data.

## Rate limiting

`src/lib/auth/rate-limit.ts` is a minimal in-memory fixed-window limiter applied to
both login and PIN entry (`src/lib/auth/actions.ts`). It is explicitly documented as
a "budget" defense in its own comments: it stops naive single-instance scripted
brute-forcing, but each serverless instance/cold-start has its own counters, so it
is not a durable guarantee across a distributed deployment. If this app ever needs a
stronger guarantee, swap it for a shared store (e.g. Upstash Redis) behind the same
`checkRateLimit()` shape — the call sites don't need to change.

## Verified, not just asserted

The following was exercised against a real local Postgres instance and a running
Next.js production build (`pnpm build && pnpm start`), driven by a real headless
browser (Playwright), not curl approximations of Next's Server Action protocol:

- RLS fail-closed behavior directly via `psql` as `app_user`: zero rows with no
  context set, correct rows with correct context, zero rows with a *different*
  parent's context.
- Full login → profile picker → kid page → Parent Mode PIN gate (wrong PIN
  rejected, correct PIN unlocks) → logout → post-logout re-protection flow.
- IDOR: requesting `/kid/<random-uuid-not-owned-by-this-parent>` redirects to
  `/profiles` rather than erroring or leaking data.
- The CSP header and nonce are present on real responses, and the app renders
  without CSP console violations in a real browser.

# Data model

Schema source of truth: `src/db/schema.ts` (Drizzle ORM). Migrations are
hand-tracked SQL files in `src/db/migrations/`, applied by `scripts/migrate.mjs` (see
[`decisions.md`](./decisions.md) for why this project doesn't use `drizzle-kit
migrate`'s own journal).

Every table except `parents` and the shared content tables carries an owner chain
back to a single `parents` row, and Row-Level Security enforces that chain at the
database layer — see [`auth-and-security.md`](./auth-and-security.md) for how.

## Entity overview

```
parents (1) ──< children (2 per family)
   │                 │
   │                 ├──< domain_mastery
   │                 ├──< assignments
   │                 ├──< reward_events
   │                 ├──< session_log
   │                 └──< writing_evaluations >── reading_passages
   │
   ├──< math_items          (parent_id NULL = shared seed content)
   ├──< reading_passages    (parent_id NULL = shared seed content)
   └── reward_settings (1:1)
```

## Tables

### `parents`

The single account per family. No public signup route creates rows here — see
`docs/requirements/security-requirements.md`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `email` | text, unique | |
| `password_hash` | text | bcrypt, 12 rounds |
| `parent_pin_hash` | text | bcrypt, 12 rounds — gates Parent Mode, separate secret from the account password |
| `name` | text | |
| `created_at` | timestamptz | |

### `children`

The (up to) two kid profiles under one parent. No login of their own — selected from
the profile picker once the parent's session is trusted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id`, cascade delete | |
| `name` | text | |
| `grade` | smallint | |
| `emoji` | text | default `🌟` — the profile-card avatar |
| `color_var` | text | default `--math` — which theme accent color this kid's UI uses |
| `leftover_minutes` | integer | default 0 — sub-30-minute practice time not yet converted to a reward point |
| `created_at` | timestamptz | |

### `math_items`

The math content bank. `parent_id IS NULL` rows are the shared, Georgia-AKS-tagged
seed bank visible to every family; a non-null `parent_id` is that family's own
custom question, added via Parent Mode's Add-a-Question form (product requirements
§4.1 — content authoring UI is not yet built).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id`, nullable | NULL = shared seed content |
| `grade` | smallint | |
| `domain` | text | `NR` \| `PAR` \| `MDR` \| `GSR` — see `docs/requirements/curriculum-standards.md` |
| `topic` | text | e.g. `place-value`, `mult-multidigit` |
| `code` | text | official Georgia standard code, e.g. `2.NR.1` |
| `difficulty` | smallint | 1–5 |
| `prompt` | text | |
| `choices` | jsonb `string[]` | |
| `answer_index` | smallint | index into `choices` |
| `explanation` | text | shown after answering |
| `created_at` | timestamptz | |

### `reading_passages`

Same `parent_id` sharing convention as `math_items`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id`, nullable | NULL = shared seed content |
| `grade` | smallint | |
| `title` | text | |
| `kind` | text | `story` \| `informational` |
| `body` | text | passage text |
| `words` | integer | word count, drives the grade-progression table |
| `mc` | jsonb `ReadingMcQuestion[]` | `{ prompt, choices, answerIndex }[]` — comprehension check |
| `writing` | jsonb `ReadingWritingPrompt[]` | `{ type: "summary" \| "opinion", prompt, starter, exemplar, keywords }[]` |
| `created_at` | timestamptz | |

`exemplar` and `keywords` on each writing prompt exist to give the AI evaluation
module (once built) a grounded reference answer and rough on-topic signal, rather
than grading from the prompt text alone.

### `domain_mastery`

One row per `(child, subject, domain)` — the current level and rolling accuracy that
drives the progress dashboard's domain table (product requirements §4.2).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `child_id` | uuid, FK → `children.id`, cascade delete | |
| `subject` | text | `math` \| `reading` |
| `domain` | text | a `MathDomain` code, or `comprehension`/`summary`/`opinion` for reading |
| `level` | smallint | default 2 — the adaptive-difficulty level (1–5) |
| `correct` / `attempted` | integer | rolling accuracy counters |
| `updated_at` | timestamptz | |

Unique index on `(child_id, subject, domain)`.

### `assignments`

Parent-assigned practice with a due date — not yet surfaced in any UI.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `child_id` | uuid, FK → `children.id`, cascade delete | |
| `domain`, `topic`, `grade` | text/smallint | |
| `due_at` | timestamptz | |
| `created_at` | timestamptz | |
| `completed_at` | timestamptz, nullable | |

### `reward_settings`

One row per parent — the two levers from product requirements §7, shared across
both kids.

| Column | Type | Notes |
|---|---|---|
| `parent_id` | uuid, PK, FK → `parents.id`, cascade delete | 1:1 with `parents` |
| `minutes_per_point` | integer | default 30 |
| `points_per_dollar` | integer | default 5 |
| `enabled` | boolean | default true — the on/off switch |

### `reward_events`

An append-only ledger per child — both points earned (tied to practice time) and
points redeemed (tied to a parent payout).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `child_id` | uuid, FK → `children.id`, cascade delete | |
| `kind` | text | `earned` \| `redeemed` |
| `points` | integer | |
| `note` | text | default `""` |
| `at` | timestamptz | |

### `session_log`

Practice session history — drives the day-by-day time chart in the progress
dashboard.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `child_id` | uuid, FK → `children.id`, cascade delete | |
| `subject`, `domain` | text | |
| `mode` | text | `time` \| `count` — which session-length control was used (product requirements §5) |
| `target` | integer | minutes or question count |
| `minutes_spent` | real | |
| `correct` / `attempted` | integer | |
| `at` | timestamptz | |

### `writing_evaluations`

The AI-graded record of one written response (product requirements §6). The parent
sees every field below; the kid only ever sees a short headline derived from `tone`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `child_id` | uuid, FK → `children.id`, cascade delete | |
| `passage_id` | uuid, FK → `reading_passages.id`, cascade delete | |
| `prompt_type` | text | `summary` \| `opinion` |
| `answer` | text | the kid's submitted response |
| `semantic_note` | text | does the answer address the question / use the passage as evidence |
| `grammar_notes` | jsonb `string[]` | |
| `spelling_notes` | jsonb `string[]` | |
| `suggested` | text | a model answer at the kid's grade level |
| `tone` | text | `on-target` \| `getting-there` \| `nice-try` — drives the kid-facing headline |
| `at` | timestamptz | |

## Roles

Two distinct Postgres roles connect to the database — see
[`auth-and-security.md`](./auth-and-security.md#two-postgres-roles-not-one) for why
this split exists and isn't optional:

- **`app_user`** — what the running Next.js app connects as (`DATABASE_URL`). Not a
  superuser, not the table owner; subject to RLS on every table.
- **The migration-owner role** (`postgres` locally; a Neon-provisioned role in
  production) — used only by `scripts/migrate.mjs` (`MIGRATIONS_DATABASE_URL`) and by
  the one-time `src/db/setup-app-role.sql` script. Never used by the running app.

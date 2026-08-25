# PDF content pipeline (RAG-assisted authoring)

A parent-driven pipeline for turning practice-material PDFs (worksheets, workbooks,
curriculum packets) stored in Google Drive into draft `math_items`/`reading_passages`
rows, grounded in the source material rather than generated from scratch. This is an
**authoring-time tool for the parent**, not a runtime feature a kid ever touches —
retrieval only happens when a parent is actively building content, never during a
kid's practice session. That framing is what keeps this both cheap and safe: cost
scales with how often a parent adds content, not with how much the kids practice,
and nothing an AI drafts reaches a kid until a parent has reviewed and approved it.

## Why this shape, not a live RAG chatbot

The product has a bounded, curated content bank (product requirements §3), not an
open-ended corpus a kid or parent queries live. The right unit of work is "take this
PDF, produce some draft questions from it, let a parent approve them" — a batch
pipeline, not a conversational retrieval system. That rules out anything that assumes
constant read traffic against a vector index (which is what would justify a dedicated
vector database's cost and operational overhead).

## Why Neon + `pgvector`, not Chroma or Elasticsearch

Chroma and Elasticsearch both require an always-on server process to hold the index.
Vercel's serverless functions can't host one for free, so either option means paying
for a separate VM (self-hosted) or a managed tier (Elastic Cloud's cheapest plan alone
exceeds this project's whole budget target — see
[`docs/requirements/security-requirements.md`](../requirements/security-requirements.md)
for the $0–8/month figure) just to store vectors for a 20–100 PDF library.

Neon — the Postgres already running this app — supports `pgvector` on every plan
including free, no add-on required, up to 2,000 dimensions on an HNSW/IVFFlat index
(more than enough for any current embedding model). Using it means: no new service to
provision or operate, no new connection/credential to secure, and the exact same
Row-Level Security model already covering every other table in this app (see
[`auth-and-security.md`](./auth-and-security.md)) extends to the new tables for free.

## Pipeline

```
Parent Mode → "Import from PDF" panel
  │
  ▼
Google Picker API (client-side widget)
  └─ OAuth scope: drive.file — only grants access to the specific file(s) a
     parent explicitly picks, never Drive-wide access. Non-sensitive scope,
     so it skips Google's app-verification review process entirely.
  │  file id + short-lived access token
  ▼
Server Action: importSourceDocument()
  ├─ download the file via Drive's files.get?alt=media
  ├─ extract text
  │    digital-text PDF  → pdf-parse (or similar), free, no API cost
  │    scanned/image PDF → sent to Claude as a native PDF content block
  │                        (Claude reads pages as images) — ordinary API
  │                        tokens, no separate OCR service
  ├─ chunk per page (or detected section)
  ├─ embed each chunk (Voyage AI voyage-4-lite)
  └─ insert source_documents + source_chunks rows, tagged by the parent
     with grade / subject / domain at import time
  │
  ▼
Server Action: generateDraftsFromChunks()
  ├─ filter source_chunks by the requested grade/subject/domain tags
  ├─ optionally rank by cosine similarity (pgvector) to a topic the
  │  parent types, e.g. "fractions word problems" — this is where
  │  semantic search earns its keep: narrowing a tag-filtered set of
  │  dozens of chunks down to the handful most relevant to one request
  ├─ hand the top-K chunks to Claude with a schema-locked prompt matching
  │  the real math_items / reading_passages column shape
  └─ insert content_drafts rows, each citing the source_chunk_ids it was
     grounded in
  │
  ▼
Parent Mode → Content tab → "Review AI-generated content" queue
  ├─ shows each draft with its source citation (which PDF, which page)
  ├─ parent edits inline (reuses the existing add/edit question form)
  └─ Approve → copied into math_items / reading_passages with
     parent_id = this family, exactly like a manually-authored custom
     question (product requirements §4.1)
     Discard → content_drafts row marked discarded, never copied
```

Nothing in this flow needs a background worker, cron job, or queue. Vercel's Hobby
tier now defaults to a 300-second function execution limit (raised from the older,
much shorter default — confirmed current as of writing, see Vercel's own docs),
which comfortably covers extracting, chunking, and embedding a typical worksheet PDF
in one request. Import and generation are two separate Server Actions so a large
PDF's extraction doesn't also have to share a timeout window with a generation call.

## New tables

Same ownership/RLS convention as every other parent-scoped table in this app: an
owner chain back to `parents`, enforced via `withParentContext()` — see
[`data-model.md`](./data-model.md) and [`auth-and-security.md`](./auth-and-security.md)
for how that mechanism works. Nothing new to build on the security side, only to
extend.

### `source_documents`

The imported PDF's metadata — one row per Drive file a parent has picked.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id`, cascade delete | |
| `drive_file_id` | text | Google Drive's file id, for re-fetching if ever needed |
| `title` | text | the PDF's filename/title |
| `grade` | smallint | parent-assigned at import |
| `subject` | text | `math` \| `reading` — parent-assigned at import |
| `domain` | text, nullable | a `MathDomain` code or reading topic, parent-assigned at import; nullable since a single PDF can span more than one |
| `page_count` | integer | |
| `created_at` | timestamptz | |

### `source_chunks`

Page-level extracted text plus its embedding, the retrieval unit for generation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `source_document_id` | uuid, FK → `source_documents.id`, cascade delete | |
| `page_range` | text | e.g. `"4"` or `"4-5"` |
| `text` | text | extracted chunk text |
| `embedding` | `vector(1024)` | `voyage-4-lite` output; nullable until the embedding call completes |
| `created_at` | timestamptz | |

### `content_drafts`

AI-generated candidates awaiting review — kept separate from the live
`math_items`/`reading_passages` tables so nothing half-reviewed can be queried by a
kid's practice session by accident; the review queue and every kid-facing query stay
simple because "every row in the real content tables is live" remains true.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id`, cascade delete | |
| `kind` | text | `math_item` \| `reading_passage` |
| `payload` | jsonb | matches the target table's insertable shape exactly |
| `source_chunk_ids` | jsonb `string[]` | which chunk(s) this draft was grounded in, for the parent-facing citation |
| `status` | text | `pending` \| `approved` \| `discarded` |
| `created_at` | timestamptz | |
| `reviewed_at` | timestamptz, nullable | |

## Cost, with sourced numbers

| Item | Cost | Source |
|---|---|---|
| `pgvector` on Neon | $0, every tier | [Neon docs](https://neon.com/docs/extensions/pgvector) — "available on every Neon plan with no add-on or paid tier required" |
| Embeddings (Voyage `voyage-4-lite`) | $0 up to 200M tokens/month, then $0.02/million | A 20–100 PDF worksheet library is realistically a few hundred thousand to low millions of tokens total — stays inside the free tier |
| Google Drive Picker/API | $0 at this volume | Free tier comfortably covers occasional file picks |
| Vercel function execution | $0, within Hobby's included usage | 300s default/max duration on Hobby as of writing — [Vercel docs](https://vercel.com/docs/functions/configuring-functions/duration) |
| Claude generation calls | ~$0–3/month | Parent-triggered only, not per-kid-session; scales with how often content is actively being authored, not with practice volume |

Net addition to the existing $0–8/month target
([`security-requirements.md`](../requirements/security-requirements.md)): roughly
**$0–3/month**, likely $0 most months given the free tiers involved.

## What's deliberately out of scope

- **No live RAG for kids.** Retrieval only runs when a parent is authoring content.
  A kid's practice session never queries `source_chunks` or calls an embedding
  model.
- **No auto-sync of a Drive folder.** A parent explicitly picks one file at a time
  via the Picker — no scheduled job scanning Drive, no risk of silently importing
  something unintended. (If the PDF library grows large enough that this becomes
  tedious, folder auto-sync is a reasonable later addition — it would need a cron
  job and idempotent re-processing logic, deliberately deferred until it's needed.)
- **No auto-publish.** Every `content_drafts` row requires explicit parent approval
  before it becomes a real `math_items`/`reading_passages` row — the same
  "never fake a grade, never skip review" posture as the AI writing evaluation
  module (product requirements §6).

## Build status

- [x] **Stage 1** — `source_documents` + `source_chunks` tables, `pgvector`
  extension enabled on Neon. See `src/db/migrations/0007_source_content.sql`.
- [ ] **Stage 2** — Drive Picker integration + `importSourceDocument()` (extraction,
  chunking, embedding).
- [ ] **Stage 3** — `generateDraftsFromChunks()` (tag-filtered + vector-ranked
  retrieval, schema-locked Claude generation).
- [ ] **Stage 4** — Parent Mode review queue UI (`content_drafts` table gets a
  home in the Content tab: approve/edit/discard).

Each stage is independently useful — Stage 1 + 2 alone produce a searchable, tagged
library of source material a parent could browse even before Stage 3's AI generation
is built.

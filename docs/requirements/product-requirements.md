# Product requirements

Milestone is a browser-based, iPad-and-laptop practice app for two kids (grade 2 and
grade 4), covering Math and Reading & Writing, tagged to Georgia's official K-12
Standards (GCPS AKS-aligned). It borrows the parts of iReady's practice loop that
suit a kid practicing alone at home — adaptive difficulty, domain organization,
growth-focused feedback — and drops the parts that don't: norm-referenced percentile
scoring and 45-minute session lengths.

This document is the functional/business spec, distilled from the original planning
document (`milestone-plan.html`, v2). It describes *what* the product must do.
[`docs/architecture/`](../architecture/) describes what was actually built to satisfy it,
including anywhere the implementation deviates from this plan's original tech choices.

## 1. The core practice loop

1. **Pick your avatar.** Each kid taps their own profile card — no typing, nothing to
   get wrong. This is the only "login" a kid ever does.
2. **Pick a subject.** Math opens a domain picker; Reading opens straight into a
   leveled passage.
3. **Set the session.** By time or by question count (see §5), then an adaptive item
   set that shifts difficulty as the kid answers.
4. **Growth screen.** A plain-language summary at the end of a session: what they
   nailed, what leveled up, what to try next — not a percentile rank or a raw score.

Adaptive difficulty is a simple streak-based level nudge per domain, tracked per
child — not a machine-learning model. A correct answer nudges the next item slightly
harder; a miss nudges it slightly easier.

## 2. Two kids, one app

- One parent-owned login. Two fully separate kid profiles underneath it, each with
  its own grade, its own item difficulty, its own mastery history.
- Neither kid can see or affect the other's progress.
- The parent signs in once, on whichever device. The app then shows a "Who's
  practicing?" screen with one large avatar card per kid, labeled with name and
  grade. Tapping a card goes straight into that kid's subject picker.
- Every question answered, every session, and every domain mastery level is stored
  against that specific child's profile, not the parent account — grade-2 content
  never appears for the grade-4 profile and vice versa.
- A small, deliberately low-key control (not something a kid would tap by accident)
  is how a parent steps into Parent Mode from the same screen.

## 3. Curriculum: Georgia's K-12 Standards, GCPS AKS-aligned

Every question and passage is tagged with an official Georgia standard code, in the
format `[grade].[domain].[standard]` (e.g. `2.NR.1`, `4.PAR.2`). GCPS's AKS documents
align to the state-adopted Georgia Standards of Excellence, so tagging to the state
code is equivalent to tagging to what GCPS teaches from. Full domain tables and the
ELA writing-task progression live in
[`docs/requirements/curriculum-standards.md`](./curriculum-standards.md).

Requirements:

- Math content covers four domains (Numerical Reasoning, Patterning & Algebraic
  Reasoning, Measurement & Data Reasoning, Geometric & Spatial Reasoning) for both
  grade 2 and grade 4, with room to extend upward as each kid advances a grade.
- Every reading passage ends with a short multiple-choice comprehension check *and*
  an elaborated written response (a summary or an opinion task) — writing is the
  point of the reading session, not an occasional extra, from grade 2 up.
- Passage length, writing-task complexity, and comprehension-check count scale with
  grade (see the progression table in `curriculum-standards.md`).
- Foundations (phonics, oral reading fluency) is explicitly out of scope for a
  screen-based app.

## 4. Parent Mode: add content, track progress

Parent Mode sits behind its own short PIN, separate from the kid profile picker and
separate from the parent's account password — a deliberate step in, not something a
kid stumbles into.

### 4.1 Content authoring

- Content lives in the database, not static files or JSON checked into the repo — a
  parent can add a question without a code change or a redeploy.
- An "Add a Question" form: pick subject, grade, domain, and standard code from
  dropdowns; choose question type and difficulty (1–5); write the prompt, answer
  choices, correct answer, and an optional one-line explanation. Saves immediately
  and is available in that kid's next session.
- The same screen lists everything already in the content bank, so a parent can edit
  or retire a question later.

### 4.2 Progress dashboard

Per kid (switchable at the top, or a combined view for both), built around three
questions: are they showing up, are they getting things right, and where should a
parent focus.

- A day-by-day bar chart of minutes practiced, so a streak or a quiet week is visible
  at a glance.
- Scores and accuracy broken down **by domain**, not one blended number — because
  "78% overall" hides whether that's evenly spread or one weak domain dragging down
  four strong ones. Each domain row shows accuracy, current level, and trend.

### 4.3 AI weekly read

A periodic (weekly by default, or on-demand via a "refresh" button) AI-written
summary per kid, looking across recent sessions and evaluations. It writes three
specific things, not a grade or a grid of numbers:

- **Strengths** — what the kid is reliably good at.
- **Focus this week** — the specific thing tripping them up, named precisely (e.g.
  "subtraction with regrouping across zeros," not "math needs work").
- **Try this** — one concrete, actionable suggestion a parent can use that evening.

This uses the same AI model as individual writing evaluations (§6).

## 5. Session length: time or question count, their choice

Before a practice set starts, the kid (or the parent, setting their default in
Parent Mode) picks how the session ends:

- **By time** — 5, 10, 15, or 20 minutes. The session always finishes the question in
  progress before stopping; it never cuts off mid-problem.
- **By question count** — 6, 10, 15, or 20 questions (for reading, this means
  passage-plus-writing-task count).

Whichever a kid picks last becomes their remembered default next time, **per kid,
per subject** — a grade-2 kid's quick 6-question math warm-up and a grade-4 kid's
steady 15-minute block are two entirely separate settings. Reading defaults to
time-based mode so a writing task never feels rushed against a count set for math.

## 6. AI evaluation module

Multiple-choice and exact-number math items grade themselves instantly. Everything
else — summary/opinion writing, and any math item where a kid explains their
reasoning — needs real judgment.

When a kid submits a written response, the app sends the question, the source
passage or problem, and the kid's answer to a small, fast AI model with instructions
to grade the way a good, patient teacher would:

- Is the answer **semantically correct** — does it address what was asked and use
  the passage as evidence, rather than echo keywords back?
- Are there **grammar** mistakes worth noting?
- Are there **spelling** mistakes worth noting?
- A **model answer** written at the kid's actual grade level and typical
  proficiency — a realistic next step, not something no elementary schooler would
  ever write.

What each audience sees is deliberately different:

- **Kid-facing**: a short, kind signal right after submitting — "nice try,"
  "getting there," or "right on target" — plus one specific thing they did well. No
  wall of red-pen corrections aimed at an 8-year-old.
- **Parent-facing**: a full breakdown per response (semantic notes, grammar notes,
  spelling notes, suggested stronger answer) in an "Evaluations" tab in Parent Mode,
  browsable by kid and by session.

The evaluation call is server-side only — the API key must never reach the browser.
It must be scoped to written-response items only, never touching instant-graded
multiple-choice or math items, so cost scales with actual written-answer volume.

## 7. Rewards: points for practice time

A points system tied to **practice time**, not to being right — showing up and doing
the work earns the reward, so it never conflicts with the AI evaluator's honest
feedback in §6. A kid struggling with opinion writing earns exactly as much as a kid
acing it, as long as both are putting in the time.

- Default rate: every 30 minutes of cumulative practice (combined across math and
  reading) earns 1 point; every 5 points is worth $1.
- Both numbers — minutes-per-point, points-per-dollar — are settings a parent
  controls from Parent Mode's Rewards panel, not hardcoded. A change only applies
  going forward; points already earned keep the value they were earned at.
- An on/off switch to pause the whole system.
- Every kid profile has a Rewards tab, visible to that kid without the parent PIN —
  it's their own view of their own points: a running total, its dollar value at
  today's rate, and a progress bar toward the next point (visible mid-session, not
  just at the end).
- "Mark as redeemed" in Parent Mode logs a payout and drops the kid's running total
  by that amount, so what a profile shows is always "what's currently owed," not a
  lifetime score that would get double-paid.

## 8. Installable web app (PWA)

"Native-feeling" on an iPad and a laptop, from one codebase, means a Progressive Web
App: installable to the home screen, launches full-screen with no browser chrome,
caches itself for instant (and partially offline) loads.

Concretely, this requires:

- A web app manifest declaring the app name, icon set, and standalone display mode.
- A service worker so the shell and recent content load instantly, including offline.
- iOS-specific meta tags (`apple-touch-icon`, `apple-mobile-web-app-capable`), since
  Safari's PWA support is real but pickier than Chrome's.
- Large touch targets, no hover-dependent UI, and a layout that works in both iPad
  portrait and laptop widescreen.

## 9. Access, accounts & security

- The app is reachable from any device, anywhere — one public HTTPS address, not
  something that only works on a home network.
- **No public sign-up.** There is exactly one parent account, hand-created; there is
  no sign-up form for a stranger to find.
- Full security requirements (transport, data access, secrets, login, dependency
  hygiene) are in
  [`docs/requirements/security-requirements.md`](./security-requirements.md).

## 10. Budget

The target is $0–8/month, dominated by the one genuinely metered cost: AI evaluation
and weekly-read calls. See `docs/requirements/security-requirements.md` for the
detailed cost breakdown and how the implementation keeps it in range.

## Explicitly out of scope (v1)

- Public sign-up / self-serve family accounts.
- Foundations (phonics, oral reading fluency) — inherently spoken-aloud.
- Norm-referenced percentile scoring against a national test population.
- Content beyond grade 2 and grade 4 at launch (the content bank is designed to
  extend upward as each kid advances a grade).

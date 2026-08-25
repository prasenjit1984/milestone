# Curriculum standards: Georgia K-12 Standards, GCPS AKS-aligned

Georgia replaced the old Common-Core-derived Georgia Standards of Excellence with a
new K-12 framework — math starting SY2023–24, ELA starting SY2025–26 — with new
domain names. Gwinnett County Public Schools' AKS (Academic Knowledge and Skills) is
the district's classroom-facing curriculum guide; GCPS states that it aligns to the
state-adopted standards, and in practice the AKS booklets reference the same domain
letters and standard codes as the state framework rather than a separate numbering
system. Tagging every question with the official Georgia standard code is therefore
equivalent to tagging it to what GCPS teaches from.

> **Open item carried from the original plan**: the state-level domain names and code
> format below are confirmed, as is that GCPS's own AKS documents use those same
> codes. No evidence of a GCPS-only numbering layer on top of that was found — if
> Gwinnett has since published one, swap it in once someone is looking at a real AKS
> booklet page.

## Math — four domains

Code format: `[grade].[domain].[standard]`

| Domain | Code | Example (Grade 2) | Covers |
|---|---|---|---|
| Numerical Reasoning | `NR` | `2.NR.1` | Place value, number sense, addition/subtraction/multiplication foundations |
| Patterning & Algebraic Reasoning | `PAR` | `2.PAR.4` | Patterns, early algebraic thinking, equations as grade increases |
| Measurement & Data Reasoning | `MDR` | `2.MDR.5` | Length, time, money, graphs, and data problems |
| Geometric & Spatial Reasoning | `GSR` | `2.GSR.7` | Shapes, attributes, partitioning, spatial reasoning |

The same four domains structure grade 4 (and presumably every grade in the
framework); grade 4's own standard numbers (e.g. `4.NR.1`, `4.PAR.2`) come from
Georgia's published grade 4 standards.

The seed content bank (`scripts/seed.ts`) currently covers grades 2 and 4 across all
four domains — 27 items total. See [`docs/architecture/data-model.md`](../architecture/data-model.md#math_items)
for how this is represented in the database (`math_items` table, with `domain`,
`topic`, `code`, and `difficulty` columns).

## ELA — read a passage, then write about it

Writing is the point, not an occasional extra. Multiple choice exists to check
comprehension quickly, but every session is built around a kid producing real,
original sentences:

- Comprehension questions sit in the **Texts** domain.
- A vocabulary-in-context or grammar question sits in **Language**.
- The elaborated written response — a **summary** ("what happened, in your own
  words") or an **opinion** ("what do you think, and why") — maps onto the Writing
  standard's informative and opinion/argumentative types, and is graded by the AI
  evaluation module (see `product-requirements.md` §6).
- This holds from grade 2 up: a 7-year-old writes a shorter, more scaffolded version
  of the same task a 5th grader writes, rather than doing multiple choice now and
  "graduating" into writing later.
- **Foundations** (phonics, oral reading fluency) is inherently spoken-aloud and out
  of scope for a screen-based app unless speech input is added later.

### What a writing task actually looks like

| Grade | Task | Prompt |
|---|---|---|
| 2 | Summary | "In 2–3 sentences, tell what happened. Start with: *This story is about…*" |
| 2 | Opinion | "Did the fox make a good choice? Write your opinion and one reason. Start with: *I think…*" |
| 4 | Summary | "Write a short summary in your own words. Include the main idea and two supporting details." |
| 4 | Opinion | "Was the character's choice the right one? Give your opinion and two reasons, using details from the story." |

### Progression, grade 2 through grade 5

| Grade | Passage length | Writing task | Comprehension check |
|---|---|---|---|
| 2 | ~150–250 words | Summary or opinion, 2–3 sentences, with a sentence-starter | 2–3 multiple choice |
| 3 | ~250–400 words | Summary or opinion, 4–6 sentences; starters fade to optional | 2 multiple choice |
| 4 | ~400–600 words | Full paragraph, 2+ reasons or details, citing the text | 1–2 multiple choice |
| 5 | ~600–800 words | Multi-paragraph; opinion tasks expect a counterpoint addressed | Rare — checked mostly through the writing itself |

The sentence-starter is the key scaffold for the grade-2 version: it's what makes
"write an elaborated answer" achievable for a 7-year-old instead of intimidating, and
it's designed to fade out naturally rather than being pulled away. This shape isn't
itself a cited standard — it's a reasonable progression worth sanity-checking against
real GCPS writing samples once more content is built.

Both kids draw from the same leveled passage library — the grade-2 reader starts at
the top of the table, the grade-4 reader starts partway down, and each climbs it
independently over the school year.

Passages are also organized by topic — fiction, science, geography, history,
social-studies — via the `reading_passages.topic` column, and the kid-facing
reading screen picks a topic first (a sidebar mirroring the math domain picker)
before picking a passage within it. The seed content bank currently includes 20
passages: 2 per topic per grade, across grades 2 and 4, each with 2 comprehension
questions and 2 writing prompts (summary + opinion). See
[`docs/architecture/data-model.md`](../architecture/data-model.md#reading_passages) for the
`reading_passages` table shape.

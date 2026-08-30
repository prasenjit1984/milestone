/**
 * Procedurally-generated arithmetic fact drills — single-digit addition/
 * subtraction, and multiplication/division facts — generated fresh on the
 * client each time a practice session starts, instead of drawn from a small
 * pre-seeded math_items pool. A fixed bank of e.g. 3 seed questions per topic
 * runs out fast (a 10+ question session exhausts it and starts repeating,
 * and picking is deterministic so even a brand-new session tends to serve
 * the same first few questions again) — arithmetic facts don't need to be
 * authored or reviewed like a word problem does, they just need to be
 * computed, so there's no reason to store a finite set of them at all.
 *
 * These topics still slot into the existing pickNext()/mastery-level-
 * closeness logic in math-practice.tsx unchanged — generateFactPool()
 * returns ordinary MathItem-shaped objects (see src/lib/data/practice.ts)
 * spread across all five difficulty levels, exactly like a curated pool
 * would, so adaptive difficulty keeps working the same way. They're merged
 * with (not a replacement for) whatever's in the real math_items bank for
 * that topic, so an AI-drafted or manually-authored word problem tagged
 * with the same topic id (e.g. a Stage 3 draft approved onto "add-1digit")
 * still shows up too — see mergedScopedPool in math-practice.tsx.
 */
import type { MathItem } from "@/lib/data/practice";

type FactOperation = "add" | "sub" | "mult" | "div";

export interface GeneratedTopicConfig {
  id: string;
  label: string;
  domain: "NR";
  op: FactOperation;
  // Which grades offer this as a practice topic — mirrors the existing
  // curriculum grade mapping (add/sub facts are a grade 2 skill in this
  // app's seed content; times-tables/division-fact fluency is grade 4's,
  // matching mult-multidigit/division already being grade-4-only topics).
  grades: number[];
}

export const GENERATED_MATH_TOPICS: GeneratedTopicConfig[] = [
  { id: "add-1digit", label: "Addition (single-digit)", domain: "NR", op: "add", grades: [2] },
  { id: "sub-1digit", label: "Subtraction (single-digit)", domain: "NR", op: "sub", grades: [2] },
  { id: "mult-1digit", label: "Multiplication facts", domain: "NR", op: "mult", grades: [4] },
  { id: "div-1digit", label: "Division facts", domain: "NR", op: "div", grades: [4] },
];

export function generatedTopicConfig(topicId: string, domain: string): GeneratedTopicConfig | undefined {
  return GENERATED_MATH_TOPICS.find((t) => t.id === topicId && t.domain === domain);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds 4 answer choices (the correct one plus 3 plausible near-miss distractors) and shuffles them. */
function buildChoices(correct: number, distractorCandidates: number[]): { choices: string[]; answerIndex: number } {
  const seen = new Set([correct]);
  const picked: number[] = [];
  for (const c of shuffle(distractorCandidates)) {
    if (picked.length >= 3) break;
    if (c < 0 || seen.has(c)) continue;
    seen.add(c);
    picked.push(c);
  }
  // Distractor generators occasionally collide or go negative — top up with
  // small random offsets so there are always exactly 3.
  let guard = 0;
  while (picked.length < 3 && guard < 50) {
    guard++;
    const delta = randInt(1, 6) * (Math.random() < 0.5 ? -1 : 1);
    const candidate = correct + delta;
    if (candidate < 0 || seen.has(candidate)) continue;
    seen.add(candidate);
    picked.push(candidate);
  }
  const all = shuffle([correct, ...picked]);
  return { choices: all.map(String), answerIndex: all.indexOf(correct) };
}

// Operand range per difficulty (1 easiest – 5 hardest), tuned per operation.
const ADD_SUB_OPERAND_CAP = [5, 6, 7, 8, 9]; // single-digit operands throughout
const TABLE_CAP = [5, 6, 8, 10, 12]; // times-table size in play

function buildAdd(difficulty: number): { prompt: string; answer: number; distractors: number[] } {
  const cap = ADD_SUB_OPERAND_CAP[difficulty - 1];
  const a = randInt(1, cap);
  const b = randInt(1, cap);
  const answer = a + b;
  return { prompt: `${a} + ${b} = ?`, answer, distractors: [answer + 1, answer - 1, answer + 2, answer - 2, a - b, a + b + 10] };
}

function buildSub(difficulty: number): { prompt: string; answer: number; distractors: number[] } {
  // Framed as "facts within 20", same shape as the app's own seed content
  // ("13 − 6 = 7"): pick two single-digit numbers, subtract one from their
  // sum, so the minuend isn't artificially capped at single digits either.
  const cap = ADD_SUB_OPERAND_CAP[difficulty - 1];
  const x = randInt(1, cap);
  const y = randInt(1, cap);
  const minuend = x + y;
  const answer = x;
  return { prompt: `${minuend} − ${y} = ?`, answer, distractors: [answer + 1, answer - 1, answer + 2, minuend, minuend + y] };
}

function buildMult(difficulty: number): { prompt: string; answer: number; distractors: number[] } {
  const cap = TABLE_CAP[difficulty - 1];
  const a = randInt(2, cap);
  const b = randInt(2, cap);
  const answer = a * b;
  return {
    prompt: `${a} × ${b} = ?`,
    answer,
    distractors: [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, a + b],
  };
}

function buildDiv(difficulty: number): { prompt: string; answer: number; distractors: number[] } {
  // Always an exact division fact (no remainders) — the inverse of a
  // multiplication table entry, same fluency skill as buildMult.
  const cap = TABLE_CAP[difficulty - 1];
  const divisor = randInt(2, cap);
  const quotient = randInt(2, cap);
  const dividend = divisor * quotient;
  return {
    prompt: `${dividend} ÷ ${divisor} = ?`,
    answer: quotient,
    distractors: [quotient + 1, quotient - 1, divisor, dividend, quotient * 2],
  };
}

const BUILDERS: Record<FactOperation, (difficulty: number) => { prompt: string; answer: number; distractors: number[] }> = {
  add: buildAdd,
  sub: buildSub,
  mult: buildMult,
  div: buildDiv,
};

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Generates a fresh pool of fact-drill questions for one topic, spread
 * evenly across all 5 difficulty levels so the existing mastery-level
 * "closest difficulty" picker (pickNext in math-practice.tsx) keeps working
 * exactly as it does for a curated pool. `perLevel` × 5 questions total —
 * defaults to comfortably more than any session length (max 30 questions),
 * so within one session — and across "practice again" sessions, since this
 * is called fresh each time — repeats are effectively impossible.
 */
export function generateFactPool(topicId: string, grade: number, perLevel = 40): MathItem[] {
  const config = GENERATED_MATH_TOPICS.find((t) => t.id === topicId);
  if (!config) return [];
  const build = BUILDERS[config.op];

  const items: MathItem[] = [];
  const seenPrompts = new Set<string>();
  for (let difficulty = 1; difficulty <= 5; difficulty++) {
    let attempts = 0;
    let madeAtThisLevel = 0;
    while (madeAtThisLevel < perLevel && attempts < perLevel * 10) {
      attempts++;
      const fact = build(difficulty);
      if (seenPrompts.has(fact.prompt)) continue; // skip exact duplicates within this pool
      seenPrompts.add(fact.prompt);
      madeAtThisLevel++;
      const { choices, answerIndex } = buildChoices(fact.answer, fact.distractors);
      items.push({
        id: randomId(),
        parentId: null,
        grade,
        domain: config.domain,
        topic: config.id,
        code: `${grade}.${config.domain}.${config.id}-gen`,
        difficulty,
        prompt: fact.prompt,
        choices,
        answerIndex,
        explanation: `${fact.prompt.replace(" = ?", "")} = ${fact.answer}.`,
        createdAt: new Date(),
      });
    }
  }
  return items;
}

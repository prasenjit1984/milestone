/**
 * Domain/topic label lookup tables and small presentation helpers, ported
 * verbatim from the approved prototype's src/data/content.ts (the codes and
 * labels themselves come from Georgia's AKS standards — see
 * docs/requirements/curriculum-standards.md). Kept separate from the DB
 * schema because these are display concerns, not data.
 */
import type { MathItem } from "@/lib/data/practice";

export const domainLabels: Record<string, string> = {
  NR: "Numerical Reasoning",
  PAR: "Patterning & Algebraic Reasoning",
  MDR: "Measurement & Data Reasoning",
  GSR: "Geometric & Spatial Reasoning",
};

export const topicLabels: Record<string, string> = {
  "place-value": "Place value",
  "add-1digit": "Addition (single-digit)",
  "sub-1digit": "Subtraction (single-digit)",
  "add-sub-2digit": "Addition & subtraction (2-digit)",
  "mult-foundations": "Multiplication foundations",
  patterns: "Patterns",
  money: "Money",
  "measuring-length": "Measuring length",
  shapes: "Shapes",
  "mult-multidigit": "Multiplication (multi-digit)",
  division: "Division",
  equations: "Equations & unknowns",
  "time-measurement": "Time",
  "fractions-measurement": "Fractions & measurement",
  "classifying-shapes": "Classifying shapes",
  "area-perimeter": "Area & perimeter",
};

export function topicLabel(id: string): string {
  return topicLabels[id] ?? id;
}

/** Unique topics available for a given grade + domain, in first-seen order. */
export function topicsFor(items: MathItem[], grade: number, domain: string): { id: string; label: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const item of items) {
    if (item.grade !== grade || item.domain !== domain) continue;
    if (seen.has(item.topic)) continue;
    seen.add(item.topic);
    out.push({ id: item.topic, label: topicLabel(item.topic) });
  }
  return out;
}

const READING_LABELS: Record<string, string> = {
  summary: "Summary writing",
  opinion: "Opinion writing",
  comprehension: "Reading comprehension",
};

export function labelFor(subject: "math" | "reading", domain: string): string {
  if (subject === "math") return domainLabels[domain] ?? domain;
  return READING_LABELS[domain] ?? domain;
}

const TIPS: Record<string, string> = {
  NR: "a few extra minutes on place value and regrouping",
  PAR: "spotting the pattern out loud before writing the next number",
  MDR: "real-world estimating — guess first, then check",
  GSR: "naming shapes and their properties during everyday moments",
  summary: "asking “what happened first, next, last?” before writing",
  opinion: "saying the opinion out loud, with a reason, before typing it",
  comprehension: "re-reading the question before picking an answer",
};

export interface MasteryRow {
  subject: string;
  domain: string;
  level: number;
  correct: number;
  attempted: number;
}

/**
 * Deterministic fallback for the "AI weekly read" — used whenever
 * ANTHROPIC_API_KEY isn't configured (see src/lib/ai/weekly-read.ts). Ported
 * from the prototype's lib/insights.ts so the degraded experience is still a
 * real, useful summary rather than a dead placeholder.
 */
export function generateWeeklyReadFallback(mastery: MasteryRow[]) {
  const scored = mastery.filter((m) => m.attempted > 0).map((m) => ({ ...m, accuracy: m.correct / m.attempted }));
  const strengths = [...scored].sort((a, b) => b.level - a.level || b.accuracy - a.accuracy).slice(0, 2);
  const weakest = [...scored].sort((a, b) => a.level - b.level || a.accuracy - b.accuracy)[0];

  const strengthText = strengths.length
    ? strengths.map((s) => labelFor(s.subject as "math" | "reading", s.domain)).join(" and ")
    : "just getting started — no strong signal yet";

  const focusText = weakest ? labelFor(weakest.subject as "math" | "reading", weakest.domain) : "—";
  const tip = weakest ? (TIPS[weakest.domain] ?? "a few short, focused sessions this week") : "keep the streak going";

  return {
    strengthText,
    focusText,
    tip,
    weakestAccuracy: weakest ? Math.round(weakest.accuracy * 100) : null,
  };
}

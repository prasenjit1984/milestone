import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  smallint,
  jsonb,
  real,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Parents: one account per family. No public signup route — accounts are
// created by the seed script / an admin CLI, never by an open POST endpoint.
// ---------------------------------------------------------------------------
export const parents = pgTable("parents", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Short PIN gating re-entry into Parent Mode from a shared/kid-facing
  // device — separate from the account password so it's quick to type but
  // still isn't the same secret a kid might see typed once and remember.
  parentPinHash: text("parent_pin_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parentsRelations = relations(parents, ({ many, one }) => ({
  children: many(children),
  rewardSettings: one(rewardSettings, {
    fields: [parents.id],
    references: [rewardSettings.parentId],
  }),
  mathItems: many(mathItems),
  readingPassages: many(readingPassages),
  sourceDocuments: many(sourceDocuments),
}));

// ---------------------------------------------------------------------------
// Children: the two kid profiles under one parent. No login of their own —
// picked from the profile screen once the parent's device/session is trusted.
// ---------------------------------------------------------------------------
export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  grade: smallint("grade").notNull(),
  emoji: text("emoji").notNull().default("🌟"),
  colorVar: text("color_var").notNull().default("--math"),
  leftoverMinutes: real("leftover_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const childrenRelations = relations(children, ({ one, many }) => ({
  parent: one(parents, { fields: [children.parentId], references: [parents.id] }),
  mastery: many(domainMastery),
  assignments: many(assignments),
  rewardEvents: many(rewardEvents),
  sessionLog: many(sessionLog),
  evaluations: many(writingEvaluations),
}));

// ---------------------------------------------------------------------------
// Math content bank. parentId NULL = shared Georgia-AKS-aligned seed content,
// visible to every family. parentId set = that family's own custom question.
// ---------------------------------------------------------------------------
export const mathItems = pgTable("math_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references(() => parents.id, { onDelete: "cascade" }),
  grade: smallint("grade").notNull(),
  domain: text("domain").notNull(), // 'NR' | 'PAR' | 'MDR' | 'GSR'
  topic: text("topic").notNull(),
  code: text("code").notNull(), // e.g. '2.NR.1'
  difficulty: smallint("difficulty").notNull(), // 1-5
  prompt: text("prompt").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  answerIndex: smallint("answer_index").notNull(),
  explanation: text("explanation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mathItemsRelations = relations(mathItems, ({ one }) => ({
  parent: one(parents, { fields: [mathItems.parentId], references: [parents.id] }),
}));

// ---------------------------------------------------------------------------
// Reading passages (shared seed content by default, same parentId convention).
// ---------------------------------------------------------------------------
export type ReadingWritingPrompt = {
  type: "summary" | "opinion";
  prompt: string;
  starter: string;
  exemplar: string;
  keywords: string[];
};

export type ReadingMcQuestion = {
  prompt: string;
  choices: string[];
  answerIndex: number;
};

export const readingPassages = pgTable("reading_passages", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references(() => parents.id, { onDelete: "cascade" }),
  grade: smallint("grade").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull(), // 'story' | 'informational'
  // 'fiction' | 'science' | 'geography' | 'history' | 'social-studies' —
  // nullable so older rows (pre-dating topics) don't need a backfill to
  // stay valid; the kid-facing picker just skips any passage without one.
  topic: text("topic"),
  body: text("body").notNull(),
  words: integer("words").notNull(),
  mc: jsonb("mc").$type<ReadingMcQuestion[]>().notNull(),
  writing: jsonb("writing").$type<ReadingWritingPrompt[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const readingPassagesRelations = relations(readingPassages, ({ one }) => ({
  parent: one(parents, { fields: [readingPassages.parentId], references: [parents.id] }),
}));

// ---------------------------------------------------------------------------
// Per-child mastery, one row per (child, subject, domain).
// ---------------------------------------------------------------------------
export const domainMastery = pgTable(
  "domain_mastery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(), // 'math' | 'reading'
    domain: text("domain").notNull(), // MathDomain code, or 'comprehension'|'summary'|'opinion'
    level: smallint("level").notNull().default(2),
    correct: integer("correct").notNull().default(0),
    attempted: integer("attempted").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("domain_mastery_child_subject_domain_idx").on(table.childId, table.subject, table.domain)]
);

export const domainMasteryRelations = relations(domainMastery, ({ one }) => ({
  child: one(children, { fields: [domainMastery.childId], references: [children.id] }),
}));

// ---------------------------------------------------------------------------
// Parent-assigned practice with a due date/time.
// ---------------------------------------------------------------------------
export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  topic: text("topic").notNull(),
  grade: smallint("grade").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  child: one(children, { fields: [assignments.childId], references: [children.id] }),
}));

// ---------------------------------------------------------------------------
// Rewards: one settings row per parent (shared levers across both kids),
// per-child ledger of earned/redeemed points.
// ---------------------------------------------------------------------------
export const rewardSettings = pgTable("reward_settings", {
  parentId: uuid("parent_id").primaryKey().references(() => parents.id, { onDelete: "cascade" }),
  minutesPerPoint: integer("minutes_per_point").notNull().default(30),
  pointsPerDollar: integer("points_per_dollar").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
});

export const rewardSettingsRelations = relations(rewardSettings, ({ one }) => ({
  parent: one(parents, { fields: [rewardSettings.parentId], references: [parents.id] }),
}));

export const rewardEvents = pgTable("reward_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'earned' | 'redeemed'
  points: integer("points").notNull(),
  note: text("note").notNull().default(""),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const rewardEventsRelations = relations(rewardEvents, ({ one }) => ({
  child: one(children, { fields: [rewardEvents.childId], references: [children.id] }),
}));

// ---------------------------------------------------------------------------
// Practice session history (drives the parent Overview time/accuracy chart).
// ---------------------------------------------------------------------------
export const sessionLog = pgTable("session_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  domain: text("domain").notNull(),
  mode: text("mode").notNull(), // 'time' | 'count'
  target: integer("target").notNull(),
  // Optional "finish N questions within X minutes" goal for count-mode
  // sessions only (null for time-mode, and null for count-mode sessions
  // where the timer toggle was left off).
  timeLimitMin: integer("time_limit_min"),
  minutesSpent: real("minutes_spent").notNull(),
  correct: integer("correct").notNull(),
  attempted: integer("attempted").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionLogRelations = relations(sessionLog, ({ one }) => ({
  child: one(children, { fields: [sessionLog.childId], references: [children.id] }),
}));

// ---------------------------------------------------------------------------
// AI-graded writing responses (Claude Haiku). Full detail is parent-only;
// kids only ever see the short kid-facing headline derived from `tone`.
// ---------------------------------------------------------------------------
export const writingEvaluations = pgTable("writing_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  passageId: uuid("passage_id").notNull().references(() => readingPassages.id, { onDelete: "cascade" }),
  promptType: text("prompt_type").notNull(), // 'summary' | 'opinion'
  answer: text("answer").notNull(),
  semanticNote: text("semantic_note").notNull(),
  grammarNotes: jsonb("grammar_notes").$type<string[]>().notNull(),
  spellingNotes: jsonb("spelling_notes").$type<string[]>().notNull(),
  suggested: text("suggested").notNull(),
  tone: text("tone").notNull(), // 'on-target' | 'getting-there' | 'nice-try'
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const writingEvaluationsRelations = relations(writingEvaluations, ({ one }) => ({
  child: one(children, { fields: [writingEvaluations.childId], references: [children.id] }),
  passage: one(readingPassages, { fields: [writingEvaluations.passageId], references: [readingPassages.id] }),
}));

// ---------------------------------------------------------------------------
// PDF content pipeline (RAG-assisted authoring) — see
// docs/architecture/rag-content-pipeline.md. Stage 1 only: the source-material
// tables. content_drafts (the AI-generated review queue) lands in a later
// migration once generation is built.
// ---------------------------------------------------------------------------

// A parent-imported PDF (picked from Google Drive via the Picker API — see
// the architecture doc for why the `drive.file` scope keeps this narrow).
export const sourceDocuments = pgTable("source_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  driveFileId: text("drive_file_id").notNull(),
  title: text("title").notNull(),
  grade: smallint("grade").notNull(),
  subject: text("subject").notNull(), // 'math' | 'reading'
  // A MathDomain code or reading topic. Nullable since a single PDF can span
  // more than one domain/topic — chunks, not the document, carry the more
  // precise tag once generation needs it.
  domain: text("domain"),
  pageCount: integer("page_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceDocumentsRelations = relations(sourceDocuments, ({ one, many }) => ({
  parent: one(parents, { fields: [sourceDocuments.parentId], references: [parents.id] }),
  chunks: many(sourceChunks),
}));

// Page-level extracted text plus its embedding — the retrieval unit for
// draft generation. voyage-4-lite output dimension (1024); embedding is
// nullable until that call completes so extraction/chunking can be
// verified independently of the embedding step.
export const sourceChunks = pgTable("source_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceDocumentId: uuid("source_document_id").notNull().references(() => sourceDocuments.id, { onDelete: "cascade" }),
  pageRange: text("page_range").notNull(), // e.g. "4" or "4-5"
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceChunksRelations = relations(sourceChunks, ({ one }) => ({
  sourceDocument: one(sourceDocuments, { fields: [sourceChunks.sourceDocumentId], references: [sourceDocuments.id] }),
}));

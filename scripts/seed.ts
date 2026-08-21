/**
 * One-time / idempotent seed script. There is no public sign-up route on
 * purpose — this script is how the first (and any additional) family
 * account gets created. Run it with:
 *
 *   pnpm db:seed
 *
 * Override the parent's credentials via env vars so this isn't stuck at a
 * hardcoded dev password:
 *
 *   SEED_PARENT_EMAIL=you@example.com SEED_PARENT_PASSWORD=... SEED_PARENT_PIN=... pnpm db:seed
 *
 * Safe to re-run: it skips creating the parent/children if that email
 * already exists, and skips the shared content bank if it's already
 * populated, rather than duplicating rows.
 *
 * This connects with MIGRATIONS_DATABASE_URL (the schema-owning role), not
 * DATABASE_URL (app_user) — deliberately, on purpose, NOT through
 * src/db/index.ts's withParentContext(). Two reasons: (1) creating the very
 * first parent row and inserting shared (parent_id IS NULL) content bank
 * rows is impossible for app_user under RLS by design (see the comment in
 * migrations/0001_rls.sql — only an RLS-bypassing connection can write
 * those), and (2) src/db/index.ts, src/lib/auth/passwords.ts etc. are
 * marked `import "server-only"`, which throws when loaded outside Next's
 * server compilation (e.g. under plain tsx) — so this script deliberately
 * keeps its own minimal DB connection and bcrypt calls instead of importing
 * them.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNull, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { ReadingMcQuestion, ReadingWritingPrompt } from "../src/db/schema";
const { children, domainMastery, mathItems, parents, readingPassages, rewardSettings } = schema;

const rawConnectionString = process.env.MIGRATIONS_DATABASE_URL ?? process.env.DATABASE_URL;
if (!rawConnectionString) {
  console.error("Set MIGRATIONS_DATABASE_URL (or DATABASE_URL) before seeding.");
  process.exit(1);
}
// TS can't carry the narrowing from the top-level guard above into main()'s
// closure below, so pin it to a definitely-string binding here instead.
const connectionString: string = rawConnectionString;
const client = postgres(connectionString, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

const SALT_ROUNDS = 12;
const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);
const hashPin = (pin: string) => bcrypt.hash(pin, SALT_ROUNDS);

const SEED_PARENT_EMAIL = process.env.SEED_PARENT_EMAIL ?? "dev@example.com";
const SEED_PARENT_PASSWORD = process.env.SEED_PARENT_PASSWORD ?? "please-change-me-1234";
const SEED_PARENT_PIN = process.env.SEED_PARENT_PIN ?? "1234";
const SEED_PARENT_NAME = process.env.SEED_PARENT_NAME ?? "Dev Parent";

// Curriculum content ported from the approved prototype (milestone-app),
// which was itself checked against Georgia's AKS math standards.
const mathBank = [
  // Grade 2 — Numerical Reasoning
  { grade: 2, domain: "NR", topic: "place-value", code: "2.NR.1", difficulty: 1, prompt: "Which number is the same as 4 hundreds, 2 tens, and 7 ones?", choices: ["247", "427", "472", "724"], answerIndex: 1, explanation: "4 hundreds = 400, 2 tens = 20, 7 ones = 7 → 400 + 20 + 7 = 427." },
  { grade: 2, domain: "NR", topic: "add-sub-2digit", code: "2.NR.2", difficulty: 2, prompt: "Maya has 38 stickers. She gets 15 more. How many stickers does she have now?", choices: ["43", "53", "23", "63"], answerIndex: 1, explanation: "38 + 15 = 53." },
  { grade: 2, domain: "NR", topic: "add-sub-2digit", code: "2.NR.2", difficulty: 3, prompt: "There are 61 apples in a basket. 27 are given away. How many apples are left?", choices: ["34", "44", "38", "24"], answerIndex: 0, explanation: "61 − 27 = 34." },
  { grade: 2, domain: "NR", topic: "add-1digit", code: "2.NR.2", difficulty: 1, prompt: "5 + 3 = ?", choices: ["7", "8", "9", "6"], answerIndex: 1, explanation: "5 + 3 = 8." },
  { grade: 2, domain: "NR", topic: "add-1digit", code: "2.NR.2", difficulty: 2, prompt: "7 + 6 = ?", choices: ["12", "13", "14", "11"], answerIndex: 1, explanation: "7 + 6 = 13." },
  { grade: 2, domain: "NR", topic: "add-1digit", code: "2.NR.2", difficulty: 3, prompt: "8 + 9 = ?", choices: ["16", "17", "18", "15"], answerIndex: 1, explanation: "8 + 9 = 17." },
  { grade: 2, domain: "NR", topic: "sub-1digit", code: "2.NR.2", difficulty: 1, prompt: "9 − 4 = ?", choices: ["4", "5", "6", "3"], answerIndex: 1, explanation: "9 − 4 = 5." },
  { grade: 2, domain: "NR", topic: "sub-1digit", code: "2.NR.2", difficulty: 2, prompt: "13 − 6 = ?", choices: ["6", "7", "8", "5"], answerIndex: 1, explanation: "13 − 6 = 7." },
  { grade: 2, domain: "NR", topic: "sub-1digit", code: "2.NR.2", difficulty: 3, prompt: "15 − 7 = ?", choices: ["7", "8", "9", "6"], answerIndex: 1, explanation: "15 − 7 = 8." },
  { grade: 2, domain: "NR", topic: "mult-foundations", code: "2.NR.3", difficulty: 1, prompt: "There are 4 groups of 2 stars. How many stars in all?", choices: ["6", "7", "8", "9"], answerIndex: 2, explanation: "4 groups of 2 is 2 + 2 + 2 + 2 = 8." },
  { grade: 2, domain: "NR", topic: "mult-foundations", code: "2.NR.3", difficulty: 2, prompt: "There are 5 groups of 3 pencils. How many pencils in all?", choices: ["12", "13", "14", "15"], answerIndex: 3, explanation: "5 groups of 3 is 3 + 3 + 3 + 3 + 3 = 15." },
  { grade: 2, domain: "NR", topic: "mult-foundations", code: "2.NR.3", difficulty: 3, prompt: "There are 3 rows of 4 chairs. How many chairs in all?", choices: ["10", "11", "12", "14"], answerIndex: 2, explanation: "3 rows of 4 is 4 + 4 + 4 = 12." },
  // Grade 2 — Patterning & Algebraic Reasoning
  { grade: 2, domain: "PAR", topic: "patterns", code: "2.PAR.4", difficulty: 1, prompt: "What comes next in the pattern? 2, 4, 6, 8, __", choices: ["9", "10", "12", "16"], answerIndex: 1, explanation: "The pattern adds 2 each time: 8 + 2 = 10." },
  { grade: 2, domain: "PAR", topic: "patterns", code: "2.PAR.4", difficulty: 3, prompt: "What comes next? 3, 6, 9, 12, __", choices: ["14", "15", "16", "18"], answerIndex: 1, explanation: "The pattern adds 3 each time: 12 + 3 = 15." },
  // Grade 2 — Measurement & Data Reasoning
  { grade: 2, domain: "MDR", topic: "money", code: "2.MDR.6", difficulty: 1, prompt: "You have 3 dimes. How many cents is that?", choices: ["13 cents", "20 cents", "30 cents", "3 cents"], answerIndex: 2, explanation: "Each dime is 10 cents: 3 × 10 = 30." },
  { grade: 2, domain: "MDR", topic: "measuring-length", code: "2.MDR.5", difficulty: 2, prompt: "Which is the better estimate for the length of a real school bus?", choices: ["10 inches", "10 feet", "36 feet", "36 miles"], answerIndex: 2, explanation: "A school bus is about 36 feet long." },
  // Grade 2 — Geometric & Spatial Reasoning
  { grade: 2, domain: "GSR", topic: "shapes", code: "2.GSR.7", difficulty: 1, prompt: "How many sides does a hexagon have?", choices: ["4", "5", "6", "8"], answerIndex: 2, explanation: "A hexagon has 6 sides." },
  { grade: 2, domain: "GSR", topic: "shapes", code: "2.GSR.7", difficulty: 3, prompt: "If you cut a square in half along its diagonal, what two shapes do you get?", choices: ["Two rectangles", "Two triangles", "Two squares", "Two circles"], answerIndex: 1, explanation: "Cutting a square corner-to-corner makes two triangles." },
  // Grade 4 — Numerical Reasoning
  { grade: 4, domain: "NR", topic: "mult-multidigit", code: "4.NR.1", difficulty: 2, prompt: "A box holds 24 pencils. How many pencils are in 6 boxes?", choices: ["120", "144", "134", "164"], answerIndex: 1, explanation: "24 × 6 = 144." },
  { grade: 4, domain: "NR", topic: "division", code: "4.NR.2", difficulty: 3, prompt: "128 ÷ 4 = ?", choices: ["24", "32", "36", "28"], answerIndex: 1, explanation: "128 ÷ 4 = 32." },
  { grade: 4, domain: "NR", topic: "mult-multidigit", code: "4.NR.1", difficulty: 4, prompt: "A theater has 18 rows with 24 seats in each row. How many seats total?", choices: ["412", "432", "422", "442"], answerIndex: 1, explanation: "18 × 24 = 432." },
  // Grade 4 — Patterning & Algebraic Reasoning
  { grade: 4, domain: "PAR", topic: "equations", code: "4.PAR.2", difficulty: 2, prompt: "What number makes this true? 9 × ▢ = 63", choices: ["6", "7", "8", "9"], answerIndex: 1, explanation: "9 × 7 = 63." },
  { grade: 4, domain: "PAR", topic: "equations", code: "4.PAR.2", difficulty: 4, prompt: "What number makes this true? 144 ÷ ▢ = 12", choices: ["10", "11", "12", "13"], answerIndex: 2, explanation: "144 ÷ 12 = 12." },
  // Grade 4 — Measurement & Data Reasoning
  { grade: 4, domain: "MDR", topic: "time-measurement", code: "4.MDR.3", difficulty: 2, prompt: "How many minutes are in 2 hours 15 minutes?", choices: ["125", "135", "145", "115"], answerIndex: 1, explanation: "2 hours = 120 minutes, plus 15 = 135." },
  { grade: 4, domain: "MDR", topic: "fractions-measurement", code: "4.MDR.4", difficulty: 3, prompt: "A recipe needs 3/4 cup of flour. How much flour is needed for 2 batches?", choices: ["1 cup", "1 1/4 cup", "1 1/2 cup", "2 cups"], answerIndex: 2, explanation: "3/4 + 3/4 = 6/4 = 1 1/2 cups." },
  // Grade 4 — Geometric & Spatial Reasoning
  { grade: 4, domain: "GSR", topic: "classifying-shapes", code: "4.GSR.1", difficulty: 2, prompt: "Which shape has exactly one pair of parallel sides?", choices: ["Square", "Trapezoid", "Rectangle", "Rhombus"], answerIndex: 1, explanation: "A trapezoid has exactly one pair of parallel sides." },
  { grade: 4, domain: "GSR", topic: "area-perimeter", code: "4.GSR.3", difficulty: 4, prompt: "A rectangle is 8 cm by 5 cm. What is its area?", choices: ["13 cm²", "26 cm²", "40 cm²", "45 cm²"], answerIndex: 2, explanation: "Area = length × width = 8 × 5 = 40 cm²." },
];

const readingBank: {
  grade: number;
  title: string;
  kind: string;
  words: number;
  body: string;
  mc: ReadingMcQuestion[];
  writing: ReadingWritingPrompt[];
}[] = [
  {
    grade: 2,
    title: "The Lost Kitten",
    kind: "story",
    words: 178,
    body: `Mia was walking home from school when she heard a tiny sound. "Mew! Mew!" She looked under a bush and saw a small gray kitten. Its fur was dirty and it looked scared.

Mia sat down next to the bush. She did not grab the kitten. She held out her hand very slowly. "It's okay," she whispered. "I won't hurt you."

The kitten sniffed her fingers. Then it took one small step closer. Mia waited. She knew that if she moved too fast, the kitten might run away.

After a few minutes, the kitten climbed into Mia's lap. Mia carried it home very carefully. Her mom helped her give the kitten a warm bath and a bowl of milk.

They made signs that said "Found Kitten" and put them up around the neighborhood. Three days later, a boy named Sam came to the door. He was crying happy tears — it was his kitten, Whiskers, who had wandered off during a thunderstorm.

Mia was sad to say goodbye, but she was glad Whiskers was back with his family. Sam let her visit sometimes, and they became good friends.`,
    mc: [
      { prompt: "Why did Mia move slowly toward the kitten?", choices: ["She was tired", "So the kitten wouldn't run away", "She didn't see it at first", "Her mom told her to"], answerIndex: 1 },
      { prompt: "How did the story end?", choices: ["Mia kept the kitten", "The kitten ran away for good", "The kitten's owner was found", "The kitten got lost again"], answerIndex: 2 },
    ],
    writing: [
      {
        type: "summary",
        prompt: "In 2–3 sentences, tell what happened in the story.",
        starter: "This story is about",
        exemplar: "This story is about a girl named Mia who finds a lost kitten and takes care of it. She puts up signs, and the kitten's owner, a boy named Sam, comes to get it back. Mia is sad to say goodbye, but she is happy the kitten found its family.",
        keywords: ["mia", "kitten", "sam", "found", "signs", "family"],
      },
      {
        type: "opinion",
        prompt: "Do you think Mia did the right thing by putting up 'Found Kitten' signs instead of keeping the kitten? Write your opinion and one reason.",
        starter: "I think",
        exemplar: "I think Mia did the right thing by putting up signs. The kitten had a family who loved it and was probably very worried, so helping them find each other again was the kind thing to do.",
        keywords: ["signs", "family", "kind", "owner", "right"],
      },
    ],
  },
  {
    grade: 4,
    title: "How Bees Make Honey",
    kind: "informational",
    words: 431,
    body: `Honeybees are some of the hardest workers in nature. A single bee might visit over a thousand flowers in one day, and a hive of bees can produce far more honey than they actually need — which is exactly why humans have been able to harvest it for thousands of years.

The process starts when a worker bee flies from flower to flower, collecting a sweet liquid called nectar. The bee stores the nectar in a special pouch called a "honey stomach," which is separate from the stomach it uses for digesting food. As the bee flies, enzymes in the honey stomach begin breaking down the complex sugars in the nectar into simpler ones.

When the bee returns to the hive, it passes the nectar to another worker bee, mouth to mouth. This bee-to-bee exchange happens several times, and each time, more enzymes are added and more water evaporates from the nectar. Eventually, the nectar is deposited into a six-sided wax cell called a honeycomb cell.

Even inside the honeycomb, the nectar is still too watery to be honey. To finish the job, bees fan their wings rapidly over the open cells, which speeds up evaporation. Once enough water has evaporated — honey is only about 17% water compared to nectar's 70% — the bees seal the cell with a thin cap of wax. This sealed honey can be stored for months, or even years, without spoiling.

Honey isn't just food for humans; it's the hive's survival plan. Bees cannot fly in cold or wet weather, so during winter or heavy rain, the whole colony survives on the honey stored during warmer months. A strong hive might store 60 to 100 pounds of honey to get through a single winter.

This is also why beekeepers only harvest the extra honey a hive produces, careful to leave enough behind so the bees themselves have enough to eat. Without that balance, a hive could starve — which is bad news for the bees, and eventually bad news for the many crops that depend on bees for pollination.`,
    mc: [
      { prompt: "According to the passage, why do bees fan their wings over the honeycomb cells?", choices: ["To cool down the hive", "To speed up evaporation of water", "To keep other insects away", "To signal other bees"], answerIndex: 1 },
      { prompt: "What is the main reason bees make more honey than they need?", choices: ["So humans can harvest it", "So they have enough to survive winter and bad weather", "So the queen bee has extra food", "To attract more bees to the hive"], answerIndex: 1 },
    ],
    writing: [
      {
        type: "summary",
        prompt: "Write a short summary of the article in your own words. Include the main idea and two supporting details.",
        starter: "",
        exemplar: "This article explains how bees turn nectar into honey. Worker bees collect nectar and pass it between each other to break it down, then store it in honeycomb cells and fan their wings to evaporate the extra water. Bees make more honey than they need so the hive can survive winter, when they can't fly out to find food.",
        keywords: ["nectar", "honeycomb", "evaporat", "winter", "worker bee", "enzyme"],
      },
      {
        type: "opinion",
        prompt: "Do you think beekeepers should be allowed to take honey from hives? Give your opinion and at least two reasons, using details from the article.",
        starter: "",
        exemplar: "I think beekeepers should be allowed to take honey, as long as they leave enough behind for the bees. The article says a hive can store 60 to 100 pounds of honey, which is often more than they need, so taking the extra doesn't hurt the bees. It also matters because bees pollinate crops people depend on, so keeping hives healthy is good for everyone.",
        keywords: ["leave enough", "60", "100 pounds", "pollinat", "balance", "extra"],
      },
    ],
  },
];

async function main() {
  console.log(`Seeding against ${connectionString.replace(/:[^:@]+@/, ":****@")}`);

  let parent = (await db.select().from(parents).where(eq(parents.email, SEED_PARENT_EMAIL)))[0];

  if (!parent) {
    const [passwordHash, parentPinHash] = await Promise.all([hashPassword(SEED_PARENT_PASSWORD), hashPin(SEED_PARENT_PIN)]);
    const inserted = await db
      .insert(parents)
      .values({ email: SEED_PARENT_EMAIL, passwordHash, parentPinHash, name: SEED_PARENT_NAME })
      .returning();
    parent = inserted[0];
    console.log(`Created parent ${SEED_PARENT_EMAIL}`);
    if (!process.env.SEED_PARENT_PASSWORD) {
      console.log(`  (using default dev password "${SEED_PARENT_PASSWORD}" and PIN "${SEED_PARENT_PIN}" — change these for anything but local dev)`);
    }

    await db.insert(rewardSettings).values({ parentId: parent.id });

    const insertedChildren = await db
      .insert(children)
      .values([
        { parentId: parent.id, name: "Zoe", grade: 2, emoji: "🌻", colorVar: "--ela" },
        { parentId: parent.id, name: "Arjun", grade: 4, emoji: "🚀", colorVar: "--math" },
      ])
      .returning();
    console.log(`Created children: ${insertedChildren.map((c) => c.name).join(", ")}`);

    const masteryDefaults = [
      { name: "Zoe", subject: "math", domain: "NR", level: 2, correct: 6, attempted: 9 },
      { name: "Zoe", subject: "math", domain: "PAR", level: 2, correct: 4, attempted: 8 },
      { name: "Zoe", subject: "math", domain: "MDR", level: 3, correct: 8, attempted: 10 },
      { name: "Zoe", subject: "math", domain: "GSR", level: 2, correct: 5, attempted: 9 },
      { name: "Zoe", subject: "reading", domain: "summary", level: 2, correct: 5, attempted: 8 },
      { name: "Zoe", subject: "reading", domain: "opinion", level: 2, correct: 4, attempted: 8 },
      { name: "Arjun", subject: "math", domain: "NR", level: 4, correct: 17, attempted: 20 },
      { name: "Arjun", subject: "math", domain: "PAR", level: 3, correct: 10, attempted: 16 },
      { name: "Arjun", subject: "math", domain: "MDR", level: 3, correct: 9, attempted: 15 },
      { name: "Arjun", subject: "math", domain: "GSR", level: 4, correct: 13, attempted: 15 },
      { name: "Arjun", subject: "reading", domain: "summary", level: 4, correct: 11, attempted: 13 },
      { name: "Arjun", subject: "reading", domain: "opinion", level: 2, correct: 6, attempted: 14 },
    ];
    await db.insert(domainMastery).values(
      masteryDefaults.map((m) => ({
        childId: insertedChildren.find((c) => c.name === m.name)!.id,
        subject: m.subject,
        domain: m.domain,
        level: m.level,
        correct: m.correct,
        attempted: m.attempted,
      }))
    );
  } else {
    console.log(`Parent ${SEED_PARENT_EMAIL} already exists — skipping account/children creation.`);
  }

  const [{ count: mathCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(mathItems).where(isNull(mathItems.parentId));
  if (mathCount === 0) {
    await db.insert(mathItems).values(mathBank.map((item) => ({ ...item, parentId: null })));
    console.log(`Inserted ${mathBank.length} shared math items.`);
  } else {
    console.log(`Shared math bank already has ${mathCount} items — skipping.`);
  }

  const [{ count: readingCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(readingPassages).where(isNull(readingPassages.parentId));
  if (readingCount === 0) {
    await db.insert(readingPassages).values(readingBank.map((p) => ({ ...p, parentId: null })));
    console.log(`Inserted ${readingBank.length} shared reading passages.`);
  } else {
    console.log(`Shared reading bank already has ${readingCount} passages — skipping.`);
  }

  console.log("Seed complete.");
  await client.end();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await client.end();
  process.exit(1);
});

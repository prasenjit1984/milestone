"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { domainLabels, topicLabel, topicsFor } from "@/lib/domains";
import { finishMathSession } from "@/lib/actions/math";
import type { MathItem } from "@/lib/data/practice";
import { Check, X, PartyPopper, TrendingUp, TrendingDown } from "lucide-react";

type MathDomain = "NR" | "PAR" | "MDR" | "GSR";
type SessionMode = "time" | "count";

const DOMAINS: MathDomain[] = ["NR", "PAR", "MDR", "GSR"];
const TIME_OPTIONS = [5, 10, 15, 20];
const COUNT_OPTIONS = [6, 10, 15, 20];
const MIXED = "mixed";

function pickNext(pool: MathItem[], level: number, usedIds: Set<string>): MathItem {
  const fresh = pool.filter((i) => !usedIds.has(i.id));
  const source = fresh.length ? fresh : pool;
  const byCloseness = [...source].sort((a, b) => Math.abs(a.difficulty - level) - Math.abs(b.difficulty - level));
  return byCloseness[0];
}

type Screen =
  | { kind: "setup" }
  | { kind: "session"; domain: MathDomain; topic: string; mode: SessionMode; target: number }
  | { kind: "results"; correct: number; attempted: number; pointsEarned: number; startLevel: number; newLevel: number; domain: MathDomain };

export function MathPractice({
  childId,
  childName,
  childGrade,
  pool,
  mastery,
  backHref,
}: {
  childId: string;
  childName: string;
  childGrade: number;
  pool: MathItem[];
  mastery: { domain: string; level: number }[];
  backHref: string;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ kind: "setup" });

  function levelFor(domain: MathDomain) {
    return mastery.find((m) => m.domain === domain)?.level ?? 2;
  }

  if (screen.kind === "setup") {
    return (
      <MathSetupScreen
        childName={childName}
        childGrade={childGrade}
        pool={pool}
        levelFor={levelFor}
        backHref={backHref}
        onStart={(domain, mode, target, topic) => setScreen({ kind: "session", domain, topic, mode, target })}
      />
    );
  }

  if (screen.kind === "session") {
    return (
      <MathSessionScreen
        childId={childId}
        childName={childName}
        childGrade={childGrade}
        pool={pool}
        startLevel={levelFor(screen.domain)}
        domain={screen.domain}
        topic={screen.topic}
        mode={screen.mode}
        target={screen.target}
        onBack={() => setScreen({ kind: "setup" })}
        onFinish={(summary) =>
          setScreen({
            kind: "results",
            correct: summary.correct,
            attempted: summary.attempted,
            pointsEarned: summary.pointsEarned,
            startLevel: summary.startLevel,
            newLevel: summary.newLevel,
            domain: screen.domain,
          })
        }
      />
    );
  }

  const pct = screen.attempted ? Math.round((screen.correct / screen.attempted) * 100) : 0;
  const message = pct >= 80 ? "Awesome work!" : pct >= 60 ? "Nice job!" : "Good effort!";
  const levelNote =
    screen.newLevel !== screen.startLevel ? `${domainLabels[screen.domain]} moved from level ${screen.startLevel} to ${screen.newLevel}` : undefined;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-math-soft">
        <PartyPopper className="h-9 w-9 text-math" />
      </div>
      <div>
        <h1 className="font-display text-3xl font-semibold">{message}</h1>
        <p className="mt-1 text-muted-foreground">{childName}, here&apos;s how it went</p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-4 rounded-3xl border border-border bg-math-soft p-6">
        <div>
          <p className="font-mono-num text-3xl font-semibold">{pct}%</p>
          <p className="text-xs text-muted-foreground">
            {screen.correct} of {screen.attempted} correct
          </p>
        </div>
        <div>
          <p className="font-mono-num text-3xl font-semibold text-amber">+{screen.pointsEarned}</p>
          <p className="text-xs text-muted-foreground">points earned</p>
        </div>
      </div>
      {levelNote && (
        <div className="flex max-w-sm items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm">
          {screen.newLevel < screen.startLevel ? (
            <TrendingDown className="h-4 w-4 text-destructive" />
          ) : (
            <TrendingUp className="h-4 w-4 text-math" />
          )}
          {levelNote}
        </div>
      )}
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" className="w-full bg-math text-white hover:bg-math/90" onClick={() => setScreen({ kind: "setup" })}>
          Practice again
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => router.push(backHref)}>
          Back to home
        </Button>
      </div>
    </div>
  );
}

function MathSetupScreen({
  childName,
  childGrade,
  pool,
  levelFor,
  backHref,
  onStart,
}: {
  childName: string;
  childGrade: number;
  pool: MathItem[];
  levelFor: (domain: MathDomain) => number;
  backHref: string;
  onStart: (domain: MathDomain, mode: SessionMode, target: number, topic: string) => void;
}) {
  const [domain, setDomain] = useState<MathDomain>("NR");
  const [topic, setTopic] = useState<string>(MIXED);
  const [mode, setMode] = useState<SessionMode>("time");
  const [target, setTarget] = useState(10);

  const options = mode === "time" ? TIME_OPTIONS : COUNT_OPTIONS;
  const topics = useMemo(() => topicsFor(pool, childGrade, domain), [pool, childGrade, domain]);

  function pickDomain(d: MathDomain) {
    setDomain(d);
    setTopic(MIXED);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title="Math" subtitle={`${childName} · Grade ${childGrade}`} backHref={backHref} />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-8 sm:px-8">
        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground">Pick a domain</p>
          <div className="grid grid-cols-2 gap-3">
            {DOMAINS.map((d) => {
              const level = levelFor(d);
              return (
                <button
                  key={d}
                  onClick={() => pickDomain(d)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    domain === d ? "border-math bg-math-soft" : "border-border bg-card hover:bg-secondary"
                  }`}
                >
                  <p className={`font-display text-base font-semibold ${domain === d ? "text-math" : ""}`}>{domainLabels[d]}</p>
                  <div className="mt-2 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={`h-1.5 w-4 rounded-full ${i <= level ? "bg-math" : "bg-secondary"}`} />
                    ))}
                    <span className="ml-1 font-mono-num text-xs text-muted-foreground">Lvl {level}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {topics.length > 0 && (
          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground">Pick a topic</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTopic(MIXED)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  topic === MIXED ? "border-math bg-math text-white" : "border-border bg-card text-foreground hover:bg-secondary"
                }`}
              >
                Mixed practice
              </button>
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopic(t.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    topic === t.id ? "border-math bg-math text-white" : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground">How long?</p>
          <div className="mb-3 inline-flex rounded-full border border-border bg-card p-1">
            {(["time", "count"] as SessionMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setTarget(10);
                }}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "time" ? "By time" : "By question count"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o}
                onClick={() => setTarget(o)}
                className={`rounded-full border px-4 py-2 font-mono-num text-sm transition ${
                  target === o ? "border-math bg-math text-white" : "border-border bg-card text-foreground hover:bg-secondary"
                }`}
              >
                {o} {mode === "time" ? "min" : "qs"}
              </button>
            ))}
          </div>
        </div>

        <Button size="lg" className="w-full bg-math text-white hover:bg-math/90" onClick={() => onStart(domain, mode, target, topic)}>
          Start practicing
        </Button>
      </div>
    </div>
  );
}

function MathSessionScreen({
  childId,
  childName,
  childGrade,
  pool,
  startLevel,
  domain,
  topic,
  mode,
  target,
  onBack,
  onFinish,
}: {
  childId: string;
  childName: string;
  childGrade: number;
  pool: MathItem[];
  startLevel: number;
  domain: MathDomain;
  topic: string;
  mode: SessionMode;
  target: number;
  onBack: () => void;
  onFinish: (summary: { correct: number; attempted: number; newLevel: number; pointsEarned: number; startLevel: number }) => void;
}) {
  const scopedPool = useMemo(() => {
    const base = pool.filter((i) => i.domain === domain);
    if (topic === MIXED) return base;
    const filtered = base.filter((i) => i.topic === topic);
    return filtered.length ? filtered : base;
  }, [pool, domain, topic]);

  const [level, setLevel] = useState(startLevel);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<MathItem>(() => pickNext(scopedPool, startLevel, new Set()));
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [ending, setEnding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = mode === "time" ? Math.max(0, target * 60 - elapsedSec) : null;
  const timeUp = mode === "time" && remaining === 0;

  async function finish(finalCorrect: number, finalAttempted: number, finalLevel: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    const minutesSpent = Math.max(0.5, Math.round((elapsedSec / 60) * 10) / 10);
    const newLevel = Math.max(1, Math.min(5, finalLevel));
    try {
      const { pointsEarned } = await finishMathSession({
        childId,
        domain,
        topic,
        mode,
        target,
        correct: finalCorrect,
        attempted: finalAttempted,
        newLevel,
        minutesSpent,
      });
      onFinish({ correct: finalCorrect, attempted: finalAttempted, newLevel, pointsEarned, startLevel });
    } catch {
      onFinish({ correct: finalCorrect, attempted: finalAttempted, newLevel, pointsEarned: 0, startLevel });
    }
  }

  function answer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const isCorrect = idx === current.answerIndex;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextAttempted = attempted + 1;
    const nextLevel = Math.max(1, Math.min(5, level + (isCorrect ? 1 : -1)));
    setCorrect(nextCorrect);
    setAttempted(nextAttempted);
    setLevel(nextLevel);

    const reachedCount = mode === "count" && nextAttempted >= target;
    if (reachedCount || (mode === "time" && timeUp)) setEnding(true);
  }

  function next() {
    if (ending || (mode === "time" && timeUp)) {
      finish(correct, attempted, level);
      return;
    }
    const nextUsed = new Set(used).add(current.id);
    setUsed(nextUsed);
    setCurrent(pickNext(scopedPool, level, nextUsed));
    setSelected(null);
  }

  const progressLabel =
    mode === "time" ? `${Math.floor((remaining ?? 0) / 60)}:${String((remaining ?? 0) % 60).padStart(2, "0")} left` : `${attempted}/${target} questions`;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={topic !== MIXED ? topicLabel(topic) : domainLabels[domain]}
        subtitle={`${childName} · Grade ${childGrade}`}
        onBack={onBack}
        right={<span className="font-mono-num text-sm text-muted-foreground">{submitting ? "Saving…" : progressLabel}</span>}
      />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-5 py-8 sm:px-8">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= level ? "bg-math" : "bg-secondary"}`} />
          ))}
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="font-mono-num text-xs text-muted-foreground">{current.code}</p>
          <p className="mt-2 font-display text-xl font-medium sm:text-2xl">{current.prompt}</p>

          <div className="mt-6 grid gap-3">
            {current.choices.map((choice, idx) => {
              const isSelected = selected === idx;
              const isAnswer = idx === current.answerIndex;
              const showState = selected !== null;
              return (
                <button
                  key={idx}
                  disabled={selected !== null}
                  onClick={() => answer(idx)}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left font-mono-num text-base transition ${
                    showState && isAnswer
                      ? "border-math bg-math-soft"
                      : showState && isSelected
                        ? "border-destructive bg-destructive/10"
                        : "border-border bg-background hover:bg-secondary"
                  }`}
                >
                  {choice}
                  {showState && isAnswer && <Check className="h-5 w-5 text-math" />}
                  {showState && isSelected && !isAnswer && <X className="h-5 w-5 text-destructive" />}
                </button>
              );
            })}
          </div>

          {selected !== null && <div className="mt-5 rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">{current.explanation}</div>}
        </div>

        {selected !== null && (
          <Button size="lg" className="w-full bg-math text-white hover:bg-math/90" disabled={submitting} onClick={next}>
            {ending || (mode === "time" && timeUp) ? "See how it went" : "Next question"}
          </Button>
        )}
      </div>
    </div>
  );
}

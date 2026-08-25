"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ClockDial } from "@/components/ui/clock-dial";
import { domainLabels, topicLabel, topicsFor } from "@/lib/domains";
import { finishMathSession } from "@/lib/actions/math";
import type { MathItem } from "@/lib/data/practice";
import { Check, X, PartyPopper, TrendingUp, TrendingDown, AlarmClock } from "lucide-react";

type MathDomain = "NR" | "PAR" | "MDR" | "GSR";
type SessionMode = "time" | "count";

const DOMAINS: MathDomain[] = ["NR", "PAR", "MDR", "GSR"];
// 5-minute steps up to an hour, and 5-question steps up to 30 — dropdowns
// rather than a row of pills since there are too many options to lay out
// as buttons.
const TIME_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 5); // 5..60
const COUNT_OPTIONS = Array.from({ length: 6 }, (_, i) => (i + 1) * 5); // 5..30
const MIXED = "mixed";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pickNext(pool: MathItem[], level: number, usedIds: Set<string>): MathItem {
  const fresh = pool.filter((i) => !usedIds.has(i.id));
  const source = fresh.length ? fresh : pool;
  const byCloseness = [...source].sort((a, b) => Math.abs(a.difficulty - level) - Math.abs(b.difficulty - level));
  return byCloseness[0];
}

type Screen =
  | { kind: "setup" }
  | { kind: "session"; domain: MathDomain; topic: string; mode: SessionMode; target: number; timeLimitMin: number | null }
  | {
      kind: "results";
      correct: number;
      attempted: number;
      pointsEarned: number;
      startLevel: number;
      newLevel: number;
      domain: MathDomain;
      mode: SessionMode;
      target: number;
      timeLimitMin: number | null;
      minutesSpent: number;
    };

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
        onStart={(domain, mode, target, topic, timeLimitMin) => setScreen({ kind: "session", domain, topic, mode, target, timeLimitMin })}
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
        timeLimitMin={screen.timeLimitMin}
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
            mode: screen.mode,
            target: screen.target,
            timeLimitMin: screen.timeLimitMin,
            minutesSpent: summary.minutesSpent,
          })
        }
      />
    );
  }

  const pct = screen.attempted ? Math.round((screen.correct / screen.attempted) * 100) : 0;
  const message = pct >= 80 ? "Awesome work!" : pct >= 60 ? "Nice job!" : "Good effort!";
  const levelNote =
    screen.newLevel !== screen.startLevel ? `${domainLabels[screen.domain]} moved from level ${screen.startLevel} to ${screen.newLevel}` : undefined;
  const timedGoal = screen.mode === "time" ? screen.target : screen.timeLimitMin;
  const hasTimedGoal = timedGoal != null;
  const wentOvertime = hasTimedGoal && screen.minutesSpent > timedGoal;
  const overBy = hasTimedGoal ? Math.round((screen.minutesSpent - timedGoal) * 10) / 10 : 0;

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
      {hasTimedGoal && (
        <div
          className={`flex max-w-sm items-center gap-2 rounded-full border px-4 py-2 text-sm ${
            wentOvertime ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-card"
          }`}
        >
          {wentOvertime && <AlarmClock className="h-4 w-4 shrink-0" />}
          {screen.mode === "time"
            ? wentOvertime
              ? `Went ${overBy} min over — ${screen.minutesSpent} min total`
              : `Finished in ${screen.minutesSpent} min (target was ${screen.target})`
            : wentOvertime
              ? `Took ${screen.minutesSpent} min — ${overBy} min over your ${timedGoal}-min goal`
              : `Finished all ${screen.target} questions in ${screen.minutesSpent} min — inside your ${timedGoal}-min goal`}
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
  onStart: (domain: MathDomain, mode: SessionMode, target: number, topic: string, timeLimitMin: number | null) => void;
}) {
  const [domain, setDomain] = useState<MathDomain>("NR");
  const [topic, setTopic] = useState<string>(MIXED);
  const [mode, setMode] = useState<SessionMode>("time");
  const [target, setTarget] = useState(10);
  const [countTimerOn, setCountTimerOn] = useState(false);
  const [countTimerMin, setCountTimerMin] = useState(15);

  const options = mode === "time" ? TIME_OPTIONS : COUNT_OPTIONS;
  const topics = useMemo(() => topicsFor(pool, childGrade, domain), [pool, childGrade, domain]);

  function pickDomain(d: MathDomain) {
    setDomain(d);
    setTopic(MIXED);
  }

  const selectedTopicLabel = topic === MIXED ? "Mixed practice" : (topics.find((t) => t.id === topic)?.label ?? "Mixed practice");

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title="Math" subtitle={`${childName} · Grade ${childGrade}`} backHref={backHref} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 lg:flex-row lg:items-start lg:gap-8 lg:py-8">
        {/* Sidebar: domain, then that domain's topics once one is picked */}
        <div className="flex flex-col gap-6 lg:w-64 lg:shrink-0">
          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground">Domain</p>
            <div className="flex flex-col gap-2">
              {DOMAINS.map((d) => {
                const level = levelFor(d);
                return (
                  <button
                    key={d}
                    onClick={() => pickDomain(d)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      domain === d ? "border-math bg-math-soft" : "border-border bg-card hover:bg-secondary"
                    }`}
                  >
                    <p className={`font-display text-sm font-semibold ${domain === d ? "text-math" : ""}`}>{domainLabels[d]}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className={`h-1.5 w-3.5 rounded-full ${i <= level ? "bg-math" : "bg-secondary"}`} />
                      ))}
                      <span className="ml-1 font-mono-num text-[11px] text-muted-foreground">Lvl {level}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {topics.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-medium text-muted-foreground">Topic</p>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => setTopic(MIXED)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    topic === MIXED ? "border-math bg-math text-white" : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  Mixed practice
                </button>
                {topics.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTopic(t.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      topic === t.id ? "border-math bg-math text-white" : "border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main: selection summary, duration, start */}
        <div className="flex flex-1 flex-col gap-8">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ready to practice</p>
            <p className="mt-1 font-display text-lg font-semibold text-math">
              {domainLabels[domain]} · {selectedTopicLabel}
            </p>
          </div>

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
            <Select value={String(target)} onValueChange={(v) => setTarget(Number(v))}>
              <SelectTrigger className="w-40 font-mono-num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o} value={String(o)}>
                    {o} {mode === "time" ? "minutes" : "questions"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {mode === "count" && (
              <div className="mt-4 max-w-sm">
                <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Timer</p>
                    <p className="text-xs text-muted-foreground">Try to finish within a set time</p>
                  </div>
                  <Switch checked={countTimerOn} onCheckedChange={setCountTimerOn} />
                </div>
                {countTimerOn && (
                  <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5">
                    <ClockDial value={countTimerMin} onChange={setCountTimerMin} min={1} max={60} />
                    <p className="text-center text-sm text-muted-foreground">
                      Finish {target} questions in {countTimerMin} min
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="w-full max-w-sm bg-math text-white hover:bg-math/90"
            onClick={() => onStart(domain, mode, target, topic, mode === "count" && countTimerOn ? countTimerMin : null)}
          >
            Start practicing
          </Button>
        </div>
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
  timeLimitMin,
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
  timeLimitMin: number | null;
  onBack: () => void;
  onFinish: (summary: {
    correct: number;
    attempted: number;
    newLevel: number;
    pointsEarned: number;
    startLevel: number;
    minutesSpent: number;
  }) => void;
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
  const [showTimeUpBanner, setShowTimeUpBanner] = useState(false);
  const finishedRef = useRef(false);
  const wasTimeUpRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // A timer applies either because the session is pure time-mode (target IS
  // the minutes) or because count-mode has an optional time goal attached
  // (timeLimitMin) — "finish N questions within X minutes" for an efficiency
  // read, without that goal ever forcing the session to end early.
  const hasTimer = mode === "time" || timeLimitMin != null;
  const timerTargetSec = mode === "time" ? target * 60 : (timeLimitMin ?? 0) * 60;
  const remaining = hasTimer ? Math.max(0, timerTargetSec - elapsedSec) : null;
  const timeUp = hasTimer && remaining === 0;
  // Once the target time is reached, practice keeps going (elapsedSec keeps
  // ticking, so the real total is still recorded when the kid finishes) —
  // we just flip the on-screen clock into a red "overtime" count-up and
  // flash a one-time heads-up banner, instead of forcing the session to end.
  const overtimeSec = hasTimer ? Math.max(0, elapsedSec - timerTargetSec) : 0;

  useEffect(() => {
    if (timeUp && !wasTimeUpRef.current) {
      setShowTimeUpBanner(true);
      const t = setTimeout(() => setShowTimeUpBanner(false), 5000);
      wasTimeUpRef.current = true;
      return () => clearTimeout(t);
    }
    wasTimeUpRef.current = timeUp;
  }, [timeUp]);

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
        timeLimitMin: mode === "count" ? timeLimitMin : null,
        correct: finalCorrect,
        attempted: finalAttempted,
        newLevel,
        minutesSpent,
      });
      onFinish({ correct: finalCorrect, attempted: finalAttempted, newLevel, pointsEarned, startLevel, minutesSpent });
    } catch {
      onFinish({ correct: finalCorrect, attempted: finalAttempted, newLevel, pointsEarned: 0, startLevel, minutesSpent });
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
    if (reachedCount) setEnding(true);
  }

  function next() {
    if (ending) {
      finish(correct, attempted, level);
      return;
    }
    const nextUsed = new Set(used).add(current.id);
    setUsed(nextUsed);
    setCurrent(pickNext(scopedPool, level, nextUsed));
    setSelected(null);
  }

  const clockPart = hasTimer ? (timeUp ? `+${formatClock(overtimeSec)}` : `${formatClock(remaining ?? 0)} left`) : null;
  const progressLabel =
    mode === "time" ? clockPart : timeLimitMin != null ? `${attempted}/${target} questions · ${clockPart}` : `${attempted}/${target} questions`;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={topic !== MIXED ? topicLabel(topic) : domainLabels[domain]}
        subtitle={`${childName} · Grade ${childGrade}`}
        onBack={onBack}
        right={
          <span
            className={`flex items-center gap-1 font-mono-num text-sm ${
              hasTimer && timeUp ? "font-semibold text-destructive" : "text-muted-foreground"
            }`}
          >
            {hasTimer && timeUp && !submitting && <AlarmClock className="h-3.5 w-3.5" />}
            {submitting ? "Saving…" : progressLabel}
          </span>
        }
      />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-5 py-8 sm:px-8">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= level ? "bg-math" : "bg-secondary"}`} />
          ))}
        </div>

        {showTimeUpBanner && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlarmClock className="h-4 w-4 shrink-0" />
            Time&apos;s up! Keep going if you&apos;d like — you can finish whenever you&apos;re ready.
          </div>
        )}

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
          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full bg-math text-white hover:bg-math/90" disabled={submitting} onClick={next}>
              {ending ? "See how it went" : "Next question"}
            </Button>
            {hasTimer && timeUp && !ending && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={submitting}
                onClick={() => finish(correct, attempted, level)}
              >
                Finish practicing
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recordMcAnswer, submitWriting, finishReadingSession } from "@/lib/actions/reading";
import { kidFacingLine } from "@/lib/ai/tone";
import type { ReadingPassage } from "@/lib/data/practice";
import { Check, X, PartyPopper } from "lucide-react";

type SessionMode = "time" | "count";
const TIME_OPTIONS = [10, 15, 20];
const COUNT_OPTIONS = [1, 2];

type Screen =
  | { kind: "list" }
  | { kind: "session"; passageId: string; mode: SessionMode; target: number }
  | { kind: "results"; correct: number; attempted: number; pointsEarned: number };

export function ReadingPractice({
  childId,
  childName,
  childGrade,
  passages,
  backHref,
}: {
  childId: string;
  childName: string;
  childGrade: number;
  passages: ReadingPassage[];
  backHref: string;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ kind: "list" });

  if (screen.kind === "list") {
    return (
      <ReadingListScreen
        childName={childName}
        childGrade={childGrade}
        passages={passages}
        backHref={backHref}
        onStart={(passageId, mode, target) => setScreen({ kind: "session", passageId, mode, target })}
      />
    );
  }

  if (screen.kind === "session") {
    const passage = passages.find((p) => p.id === screen.passageId)!;
    return (
      <ReadingSessionScreen
        childId={childId}
        childName={childName}
        childGrade={childGrade}
        passage={passage}
        mode={screen.mode}
        target={screen.target}
        onBack={() => setScreen({ kind: "list" })}
        onFinish={(summary) => setScreen({ kind: "results", ...summary })}
      />
    );
  }

  const pct = screen.attempted ? Math.round((screen.correct / screen.attempted) * 100) : 0;
  const message = pct >= 80 ? "Awesome work!" : pct >= 60 ? "Nice job!" : "Good effort!";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ela-soft">
        <PartyPopper className="h-9 w-9 text-ela" />
      </div>
      <div>
        <h1 className="font-display text-3xl font-semibold">{message}</h1>
        <p className="mt-1 text-muted-foreground">{childName}, here&apos;s how it went</p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-4 rounded-3xl border border-border bg-ela-soft p-6">
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
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" className="w-full bg-ela text-white hover:bg-ela/90" onClick={() => setScreen({ kind: "list" })}>
          Read another
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => router.push(backHref)}>
          Back to home
        </Button>
      </div>
    </div>
  );
}

function ReadingListScreen({
  childName,
  childGrade,
  passages,
  backHref,
  onStart,
}: {
  childName: string;
  childGrade: number;
  passages: ReadingPassage[];
  backHref: string;
  onStart: (passageId: string, mode: SessionMode, target: number) => void;
}) {
  const [pickedId, setPickedId] = useState(passages[0]?.id ?? "");
  const [mode, setMode] = useState<SessionMode>("time");
  const [target, setTarget] = useState(15);

  const options = mode === "time" ? TIME_OPTIONS : COUNT_OPTIONS;
  const picked = passages.find((p) => p.id === pickedId);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title="Reading" subtitle={`${childName} · Grade ${childGrade}`} backHref={backHref} />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-8 sm:px-8">
        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground">Pick a passage</p>
          <div className="grid gap-3">
            {passages.map((p) => (
              <button
                key={p.id}
                onClick={() => setPickedId(p.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  pickedId === p.id ? "border-ela bg-ela-soft" : "border-border bg-card hover:bg-secondary"
                }`}
              >
                <p className={`font-display text-lg font-semibold ${pickedId === p.id ? "text-ela" : ""}`}>{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {p.kind === "story" ? "Story" : "Informational"} · ~{p.words} words
                </p>
              </button>
            ))}
            {passages.length === 0 && <p className="text-sm text-muted-foreground">No passages yet for grade {childGrade}.</p>}
          </div>
        </div>

        {picked && (
          <>
            <div>
              <p className="mb-3 text-sm font-medium text-muted-foreground">How long?</p>
              <div className="mb-3 inline-flex rounded-full border border-border bg-card p-1">
                {(["time", "count"] as SessionMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setTarget(m === "time" ? 15 : 1);
                    }}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {m === "time" ? "By time" : "By passage count"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <button
                    key={o}
                    onClick={() => setTarget(o)}
                    className={`rounded-full border px-4 py-2 font-mono-num text-sm transition ${
                      target === o ? "border-ela bg-ela text-white" : "border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {o} {mode === "time" ? "min" : o === 1 ? "passage" : "passages"}
                  </button>
                ))}
              </div>
            </div>

            <Button size="lg" className="w-full bg-ela text-white hover:bg-ela/90" onClick={() => onStart(picked.id, mode, target)}>
              Start reading
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

type Step = { kind: "read" } | { kind: "mc"; idx: number } | { kind: "writing"; idx: number } | { kind: "done" };

function ReadingSessionScreen({
  childId,
  childName,
  childGrade,
  passage,
  mode,
  target,
  onBack,
  onFinish,
}: {
  childId: string;
  childName: string;
  childGrade: number;
  passage: ReadingPassage;
  mode: SessionMode;
  target: number;
  onBack: () => void;
  onFinish: (summary: { correct: number; attempted: number; pointsEarned: number }) => void;
}) {
  const steps: Step[] = useMemo(() => {
    const s: Step[] = [{ kind: "read" }];
    passage.mc.forEach((_, idx) => s.push({ kind: "mc", idx }));
    passage.writing.forEach((_, idx) => s.push({ kind: "writing", idx }));
    s.push({ kind: "done" });
    return s;
  }, [passage]);

  const [stepPos, setStepPos] = useState(0);
  const [mcSelected, setMcSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<Awaited<ReturnType<typeof submitWriting>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const step = steps[stepPos];

  async function finish(finalCorrect: number, finalAttempted: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const minutesSpent = Math.max(0.5, Math.round((elapsedSec / 60) * 10) / 10);
    try {
      const { pointsEarned } = await finishReadingSession({ childId, mode, target, correct: finalCorrect, attempted: finalAttempted, minutesSpent });
      onFinish({ correct: finalCorrect, attempted: finalAttempted, pointsEarned });
    } catch {
      onFinish({ correct: finalCorrect, attempted: finalAttempted, pointsEarned: 0 });
    }
  }

  async function answerMc(idx: number) {
    if (mcSelected !== null) return;
    setMcSelected(idx);
    const item = passage.mc[(step as { kind: "mc"; idx: number }).idx];
    const isCorrect = idx === item.answerIndex;
    setCorrect((c) => c + (isCorrect ? 1 : 0));
    setAttempted((a) => a + 1);
    await recordMcAnswer({ childId, isCorrect }).catch(() => {});
  }

  async function submitWritingAnswer() {
    setBusy(true);
    const idx = (step as { kind: "writing"; idx: number }).idx;
    try {
      const result = await submitWriting({ childId, passageId: passage.id, promptIndex: idx, answer: draft });
      setFeedback(result);
      setCorrect((c) => c + (result.tone === "on-target" ? 1 : 0));
      setAttempted((a) => a + 1);
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    setMcSelected(null);
    setDraft("");
    setFeedback(null);
    if (stepPos + 1 >= steps.length - 1) {
      finish(correct, attempted);
      return;
    }
    setStepPos((p) => p + 1);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        title={passage.title}
        subtitle={`${childName} · Grade ${childGrade}`}
        onBack={onBack}
        right={
          <span className="font-mono-num text-sm text-muted-foreground">
            {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
          </span>
        }
      />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8">
        {step.kind === "read" && (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="mb-1 font-mono-num text-xs uppercase tracking-wide text-muted-foreground">
              {passage.kind === "story" ? "Story" : "Informational"} · ~{passage.words} words
            </p>
            <h2 className="mb-4 font-display text-2xl font-semibold text-ela">{passage.title}</h2>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1 text-[1.05rem] leading-relaxed">
              {passage.body.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <Button size="lg" className="mt-6 w-full bg-ela text-white hover:bg-ela/90" onClick={() => setStepPos((p) => p + 1)}>
              I&apos;m done reading
            </Button>
          </div>
        )}

        {step.kind === "mc" && (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="mb-4 font-display text-xl font-medium">{passage.mc[step.idx].prompt}</p>
            <div className="grid gap-3">
              {passage.mc[step.idx].choices.map((choice, idx) => {
                const isSelected = mcSelected === idx;
                const isAnswer = idx === passage.mc[step.idx].answerIndex;
                const showState = mcSelected !== null;
                return (
                  <button
                    key={idx}
                    disabled={mcSelected !== null}
                    onClick={() => answerMc(idx)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      showState && isAnswer
                        ? "border-ela bg-ela-soft"
                        : showState && isSelected
                          ? "border-destructive bg-destructive/10"
                          : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    {choice}
                    {showState && isAnswer && <Check className="h-5 w-5 text-ela" />}
                    {showState && isSelected && !isAnswer && <X className="h-5 w-5 text-destructive" />}
                  </button>
                );
              })}
            </div>
            {mcSelected !== null && (
              <Button size="lg" className="mt-5 w-full bg-ela text-white hover:bg-ela/90" onClick={advance}>
                Continue
              </Button>
            )}
          </div>
        )}

        {step.kind === "writing" && (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ela">
              {passage.writing[step.idx].type === "summary" ? "Write a summary" : "Write your opinion"}
            </p>
            <p className="mb-4 font-display text-xl font-medium">{passage.writing[step.idx].prompt}</p>

            {!feedback ? (
              <>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={passage.writing[step.idx].starter ? `${passage.writing[step.idx].starter}…` : "Type your answer…"}
                  rows={6}
                  className="text-base"
                />
                <Button
                  size="lg"
                  className="mt-4 w-full bg-ela text-white hover:bg-ela/90"
                  disabled={draft.trim().length === 0 || busy}
                  onClick={submitWritingAnswer}
                >
                  {busy ? "Checking…" : "Submit"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-ela-soft p-4">
                  <p className="font-display text-lg font-semibold text-ela">{kidFacingLine(feedback.tone).headline}</p>
                  <p className="mt-1 text-sm text-foreground/80">{kidFacingLine(feedback.tone).note}</p>
                </div>
                <Button size="lg" className="w-full bg-ela text-white hover:bg-ela/90" onClick={advance}>
                  Continue
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

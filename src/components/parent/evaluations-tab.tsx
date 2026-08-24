"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";

export interface EvaluationRow {
  id: string;
  childId: string;
  passageId: string;
  promptType: string;
  answer: string;
  semanticNote: string;
  grammarNotes: string[];
  spellingNotes: string[];
  suggested: string;
  tone: string;
  at: string;
}

interface ChildLite {
  id: string;
  name: string;
  grade: number;
  emoji: string;
}

const TONE_LABEL: Record<string, { text: string; cls: string }> = {
  "on-target": { text: "On target", cls: "bg-math-soft text-math" },
  "getting-there": { text: "Getting there", cls: "bg-amber-soft text-amber" },
  "nice-try": { text: "Needs another pass", cls: "bg-destructive/10 text-destructive" },
  pending: { text: "Pending AI review", cls: "bg-secondary text-muted-foreground" },
};

export function EvaluationsTab({
  evaluations,
  childList,
  passageTitleById,
}: {
  evaluations: EvaluationRow[];
  childList: ChildLite[];
  passageTitleById: Record<string, string>;
}) {
  const [childId, setChildId] = useState<string>("all");

  const rows = evaluations
    .filter((e) => childId === "all" || e.childId === childId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="space-y-6">
      <div className="inline-flex flex-wrap rounded-full border border-border bg-card p-1">
        <button
          onClick={() => setChildId("all")}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            childId === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Both
        </button>
        {childList.map((c) => (
          <button
            key={c.id}
            onClick={() => setChildId(c.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              childId === c.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <MessageSquareText className="mx-auto mb-2 h-6 w-6" />
          No written responses yet — they&apos;ll show up here as soon as a reading session includes a summary or opinion answer.
        </div>
      )}

      <div className="space-y-4">
        {rows.map((ev) => {
          const child = childList.find((c) => c.id === ev.childId);
          const passageTitle = passageTitleById[ev.passageId];
          const tone = TONE_LABEL[ev.tone] ?? TONE_LABEL.pending;
          return (
            <div key={ev.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono-num text-xs text-muted-foreground">
                  {child?.emoji} {child?.name} · {passageTitle ?? "Passage"} · {ev.promptType === "summary" ? "Summary" : "Opinion"}
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.text}</span>
              </div>

              <p className="mt-3 rounded-xl bg-secondary p-3 text-sm italic text-secondary-foreground">&quot;{ev.answer}&quot;</p>

              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="font-semibold">Semantic</dt>
                  <dd className="text-muted-foreground">{ev.semanticNote}</dd>
                </div>
                {ev.grammarNotes.length > 0 && (
                  <div>
                    <dt className="font-semibold">Grammar</dt>
                    <dd className="text-muted-foreground">{ev.grammarNotes.join(" ")}</dd>
                  </div>
                )}
                {ev.spellingNotes.length > 0 && (
                  <div>
                    <dt className="font-semibold">Spelling</dt>
                    <dd className="text-muted-foreground">{ev.spellingNotes.join(", ")}</dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold">Suggested stronger answer</dt>
                  <dd className="text-muted-foreground">{ev.suggested}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

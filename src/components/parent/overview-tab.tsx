"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Minus, AlarmClock } from "lucide-react";
import { labelFor } from "@/lib/domains";
import type { WeeklyRead } from "@/lib/ai/weekly-read";

export interface ChildOverview {
  child: { id: string; name: string; grade: number; emoji: string };
  sessionLog: {
    id: string;
    subject: string;
    domain: string;
    mode: string;
    target: number;
    timeLimitMin: number | null;
    minutesSpent: number;
    correct: number;
    attempted: number;
    at: string;
  }[];
  mastery: { subject: string; domain: string; level: number; correct: number; attempted: number }[];
  weeklyRead: WeeklyRead;
  balance: number;
  events: { id: string; kind: string; points: number; at: string }[];
}

function lastNDays(n: number) {
  const out: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { weekday: "short" }) });
  }
  return out;
}

export function OverviewTab({ perChild }: { perChild: ChildOverview[] }) {
  const [childId, setChildId] = useState(perChild[0]?.child.id);
  const current = perChild.find((c) => c.child.id === childId) ?? perChild[0];
  const days = useMemo(() => lastNDays(7), []);

  if (!current) {
    return <p className="text-sm text-muted-foreground">No child profiles yet.</p>;
  }

  const byDay: Record<string, number> = {};
  for (const s of current.sessionLog) {
    const key = s.at.slice(0, 10);
    byDay[key] = (byDay[key] ?? 0) + s.minutesSpent;
  }
  const maxMin = Math.max(1, ...days.map((d) => byDay[d.key] ?? 0));
  const totalWeek = Math.round(days.reduce((sum, d) => sum + (byDay[d.key] ?? 0), 0));
  const sessionCount = current.sessionLog.filter((s) => days.some((d) => d.key === s.at.slice(0, 10))).length;
  const domains = current.mastery.filter((m) => m.attempted > 0);
  const timedAttempts = [...current.sessionLog]
    .filter((s) => s.mode === "time" || s.timeLimitMin != null)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="inline-flex rounded-full border border-border bg-card p-1">
        {perChild.map((c) => (
          <button
            key={c.child.id}
            onClick={() => setChildId(c.child.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              childId === c.child.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {c.child.emoji} {c.child.name}
          </button>
        ))}
      </div>

      <section>
        <h3 className="mb-3 font-display text-lg font-semibold">Time practiced</h3>
        <div className="flex h-32 items-end gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm sm:gap-3">
          {days.map((d) => {
            const min = byDay[d.key] ?? 0;
            const h = Math.max(3, Math.round((min / maxMin) * 100));
            return (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono-num text-[10px] text-muted-foreground">{min ? Math.round(min) : ""}</span>
                <div className="flex w-full items-end justify-center" style={{ height: 60 }}>
                  <div className="w-full max-w-6 rounded-t-md bg-primary" style={{ height: `${h}%` }} />
                </div>
                <span className="font-mono-num text-[10px] uppercase text-muted-foreground">{d.label}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {totalWeek} minutes across {sessionCount} sessions this week.
        </p>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg font-semibold">Timed attempts</h3>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Domain</th>
                <th className="px-4 py-2 font-medium">Goal</th>
                <th className="px-4 py-2 font-medium">Actual time</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {timedAttempts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No timed practice sessions yet.
                  </td>
                </tr>
              )}
              {timedAttempts.map((s) => {
                const goalMin = s.mode === "time" ? s.target : (s.timeLimitMin ?? 0);
                const overtime = s.minutesSpent > goalMin;
                const goalLabel = s.mode === "time" ? `${s.target} min` : `${s.target} Qs in ${s.timeLimitMin} min`;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{labelFor(s.subject as "math" | "reading", s.domain)}</td>
                    <td className="px-4 py-2.5 font-mono-num text-muted-foreground">{goalLabel}</td>
                    <td className={`px-4 py-2.5 font-mono-num ${overtime ? "font-semibold text-destructive" : ""}`}>
                      <span className="inline-flex items-center gap-1">
                        {overtime && <AlarmClock className="h-3.5 w-3.5" />}
                        {s.minutesSpent} min
                        {overtime && ` (+${Math.round((s.minutesSpent - goalMin) * 10) / 10})`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(s.at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg font-semibold">Scores &amp; accuracy</h3>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Domain</th>
                <th className="px-4 py-2 font-medium">Accuracy</th>
                <th className="px-4 py-2 font-medium">Level</th>
                <th className="px-4 py-2 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No practice logged yet.
                  </td>
                </tr>
              )}
              {domains.map((m) => {
                const acc = Math.round((m.correct / m.attempted) * 100);
                const Trend = acc >= 70 ? ArrowUp : acc < 50 ? ArrowDown : Minus;
                const trendColor = acc >= 70 ? "text-math" : acc < 50 ? "text-destructive" : "text-muted-foreground";
                return (
                  <tr key={`${m.subject}-${m.domain}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{labelFor(m.subject as "math" | "reading", m.domain)}</td>
                    <td className="px-4 py-2.5 font-mono-num">{acc}%</td>
                    <td className="px-4 py-2.5 font-mono-num">{m.level}/5</td>
                    <td className="px-4 py-2.5">
                      <Trend className={`h-4 w-4 ${trendColor}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg font-semibold">
          {current.weeklyRead.aiGenerated ? "AI weekly read" : "Weekly read"}
        </h3>
        <div className="rounded-2xl border border-border border-l-4 border-l-primary bg-card p-5 shadow-sm">
          <p className="mb-3 font-mono-num text-xs uppercase tracking-wide text-primary">
            {current.child.name} · Grade {current.child.grade}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold">Strengths</dt>
            <dd className="text-muted-foreground">{current.weeklyRead.strengthText}.</dd>
            <dt className="font-semibold">Focus this week</dt>
            <dd className="text-muted-foreground">
              {current.weeklyRead.focusText}
              {current.weeklyRead.weakestAccuracy !== null ? ` — currently around ${current.weeklyRead.weakestAccuracy}% accuracy.` : "."}
            </dd>
            <dt className="font-semibold">Try this</dt>
            <dd className="text-muted-foreground">{current.weeklyRead.tip}.</dd>
          </dl>
          {!current.weeklyRead.aiGenerated && (
            <p className="mt-4 text-xs text-muted-foreground">
              Computed from mastery data. Add an ANTHROPIC_API_KEY to have Claude Haiku write this instead.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

import { requireParentModeUnlocked, listChildren } from "@/lib/data/dal";
import {
  getSessionLog,
  getMasteryForOverview,
  getRewardSettings,
  getRewardBalance,
  getRewardEvents,
  getOwnMathItems,
  getEvaluations,
  getReadingPassageTitles,
} from "@/lib/data/dashboard";
import { generateWeeklyRead } from "@/lib/ai/weekly-read";
import { DashboardShell } from "@/components/parent/dashboard-shell";

export default async function ParentDashboardPage() {
  await requireParentModeUnlocked();
  const children = await listChildren();

  const perChild = await Promise.all(
    children.map(async (child) => {
      const [sessionLog, mastery, balance, events] = await Promise.all([
        getSessionLog(child.id, 7),
        getMasteryForOverview(child.id),
        getRewardBalance(child.id),
        getRewardEvents(child.id, 5),
      ]);
      const weeklyRead = await generateWeeklyRead(child.name, child.grade, mastery);
      return {
        child: { id: child.id, name: child.name, grade: child.grade, emoji: child.emoji },
        sessionLog: sessionLog.map((s) => ({
          id: s.id,
          subject: s.subject,
          domain: s.domain,
          mode: s.mode,
          target: s.target,
          minutesSpent: s.minutesSpent,
          correct: s.correct,
          attempted: s.attempted,
          at: s.at.toISOString(),
        })),
        mastery: mastery.map((m) => ({ subject: m.subject, domain: m.domain, level: m.level, correct: m.correct, attempted: m.attempted })),
        weeklyRead,
        balance,
        events: events.map((e) => ({ id: e.id, kind: e.kind, points: e.points, at: e.at.toISOString() })),
      };
    })
  );

  const [rewardSettings, ownMathItems, evaluations, passages] = await Promise.all([
    getRewardSettings(),
    getOwnMathItems(),
    getEvaluations(),
    getReadingPassageTitles(),
  ]);
  const passageTitleById = Object.fromEntries(passages.map((p) => [p.id, p.title]));

  return (
    <DashboardShell
      perChild={perChild}
      rewardSettings={rewardSettings}
      ownMathItems={ownMathItems.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
      evaluations={evaluations.map((e) => ({ ...e, at: e.at.toISOString() }))}
      passageTitleById={passageTitleById}
    />
  );
}

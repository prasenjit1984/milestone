"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { lockParentModeAction } from "@/lib/auth/actions";
import { LayoutDashboard, FileText, ClipboardCheck, Gift, Users } from "lucide-react";
import { OverviewTab, type ChildOverview } from "@/components/parent/overview-tab";
import { ContentTab, type OwnMathItem } from "@/components/parent/content-tab";
import type { SourceDocumentSummary } from "@/components/parent/pdf-import-panel";
import type { ContentDraftSummary, SourceTopicSummary } from "@/components/parent/draft-review-panel";
import { EvaluationsTab, type EvaluationRow } from "@/components/parent/evaluations-tab";
import { RewardsTab, type RewardSettingsData } from "@/components/parent/rewards-tab";
import { ProfilesTab } from "@/components/parent/profiles-tab";

const NAV_ITEMS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "content", label: "Content", icon: FileText },
  { value: "evaluations", label: "Evaluations", icon: ClipboardCheck },
  { value: "rewards", label: "Rewards", icon: Gift },
  { value: "profiles", label: "Profiles", icon: Users },
];

export function DashboardShell({
  perChild,
  rewardSettings,
  ownMathItems,
  sourceDocuments,
  sourceTopics,
  contentDrafts,
  evaluations,
  passageTitleById,
  nonce,
}: {
  perChild: ChildOverview[];
  rewardSettings: RewardSettingsData;
  ownMathItems: OwnMathItem[];
  sourceDocuments: SourceDocumentSummary[];
  sourceTopics: SourceTopicSummary[];
  contentDrafts: ContentDraftSummary[];
  evaluations: EvaluationRow[];
  passageTitleById: Record<string, string>;
  nonce?: string;
}) {
  const children = perChild.map((c) => c.child);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div>
          <p className="font-display text-lg font-semibold">Parent Mode</p>
          <p className="text-xs text-muted-foreground">Progress, content, evaluations & rewards</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/profiles" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Profiles
          </Link>
          <form action={lockParentModeAction}>
            <Button type="submit" variant="ghost" size="sm">
              Lock
            </Button>
          </form>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-8">
        <Tabs defaultValue="overview" orientation="vertical" className="flex w-full flex-1 flex-col items-stretch gap-6 sm:flex-row sm:items-start sm:gap-8">
          <TabsList className="flex h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 bg-transparent p-0 sm:w-52 sm:border-r sm:border-border sm:pr-4">
            {NAV_ITEMS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="w-full justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1">
            <TabsContent value="overview">
              <OverviewTab perChild={perChild} />
            </TabsContent>
            <TabsContent value="content">
              <ContentTab ownMathItems={ownMathItems} sourceDocuments={sourceDocuments} sourceTopics={sourceTopics} contentDrafts={contentDrafts} nonce={nonce} />
            </TabsContent>
            <TabsContent value="evaluations">
              <EvaluationsTab evaluations={evaluations} childList={children} passageTitleById={passageTitleById} />
            </TabsContent>
            <TabsContent value="rewards">
              <RewardsTab settings={rewardSettings} perChild={perChild} />
            </TabsContent>
            <TabsContent value="profiles">
              <ProfilesTab childList={children} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

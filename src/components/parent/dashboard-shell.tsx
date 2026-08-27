"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { lockParentModeAction } from "@/lib/auth/actions";
import { OverviewTab, type ChildOverview } from "@/components/parent/overview-tab";
import { ContentTab, type OwnMathItem } from "@/components/parent/content-tab";
import type { SourceDocumentSummary } from "@/components/parent/pdf-import-panel";
import type { ContentDraftSummary } from "@/components/parent/draft-review-panel";
import { EvaluationsTab, type EvaluationRow } from "@/components/parent/evaluations-tab";
import { RewardsTab, type RewardSettingsData } from "@/components/parent/rewards-tab";
import { ProfilesTab } from "@/components/parent/profiles-tab";

export function DashboardShell({
  perChild,
  rewardSettings,
  ownMathItems,
  sourceDocuments,
  contentDrafts,
  evaluations,
  passageTitleById,
  nonce,
}: {
  perChild: ChildOverview[];
  rewardSettings: RewardSettingsData;
  ownMathItems: OwnMathItem[];
  sourceDocuments: SourceDocumentSummary[];
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

      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-6 sm:px-8">
        <Tabs defaultValue="overview">
          <TabsList className="mb-6 flex w-full flex-wrap justify-start gap-1 bg-secondary/60 p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
            <TabsTrigger value="profiles">Profiles</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab perChild={perChild} />
          </TabsContent>
          <TabsContent value="content">
            <ContentTab ownMathItems={ownMathItems} sourceDocuments={sourceDocuments} contentDrafts={contentDrafts} nonce={nonce} />
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
        </Tabs>
      </div>
    </div>
  );
}

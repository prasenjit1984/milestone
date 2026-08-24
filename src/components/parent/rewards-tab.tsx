"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pointsToDollars, formatDollars } from "@/lib/rewards";
import { updateRewardSettings, redeemPoints } from "@/lib/actions/rewards";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ChildOverview } from "@/components/parent/overview-tab";

export interface RewardSettingsData {
  parentId: string;
  minutesPerPoint: number;
  pointsPerDollar: number;
  enabled: boolean;
}

export function RewardsTab({ settings, perChild }: { settings: RewardSettingsData; perChild: ChildOverview[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [redeemChild, setRedeemChild] = useState<string | null>(null);
  // Optimistic local mirror so sliders/switch feel instant; server action
  // still re-verifies the Parent Mode PIN gate independently.
  const [local, setLocal] = useState(settings);

  function patch(update: Partial<RewardSettingsData>) {
    setLocal((prev) => ({ ...prev, ...update }));
    startTransition(async () => {
      await updateRewardSettings(update);
      router.refresh();
    });
  }

  function confirmRedeem(childId: string) {
    startTransition(async () => {
      await redeemPoints({ childId });
      setRedeemChild(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Rewards settings</h3>
          <Switch checked={local.enabled} disabled={isPending} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>

        <div className={`space-y-6 ${local.enabled ? "" : "pointer-events-none opacity-40"}`}>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm">Minutes per point</Label>
              <span className="font-mono-num text-sm text-amber">{local.minutesPerPoint} min</span>
            </div>
            <Slider
              value={[local.minutesPerPoint]}
              min={10}
              max={60}
              step={5}
              onValueChange={([v]) => setLocal((prev) => ({ ...prev, minutesPerPoint: v }))}
              onValueCommit={([v]) => patch({ minutesPerPoint: v })}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm">Points per dollar</Label>
              <span className="font-mono-num text-sm text-amber">{local.pointsPerDollar} pts</span>
            </div>
            <Slider
              value={[local.pointsPerDollar]}
              min={1}
              max={10}
              step={1}
              onValueChange={([v]) => setLocal((prev) => ({ ...prev, pointsPerDollar: v }))}
              onValueCommit={([v]) => patch({ pointsPerDollar: v })}
            />
          </div>

          <p className="rounded-xl bg-amber-soft p-3 text-xs text-foreground/80">
            Right now: {local.minutesPerPoint} minutes = 1 point, and {local.pointsPerDollar} points ={" "}
            {formatDollars(pointsToDollars(local.pointsPerDollar, local))}. Changes only apply to points earned from now on.
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-display text-lg font-semibold">Balances</h3>
        <div className="space-y-3">
          {perChild.map(({ child, balance, events }) => {
            const dollars = pointsToDollars(balance, local);
            const recent = events.slice(0, 4);
            return (
              <div key={child.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-semibold">
                    {child.emoji} {child.name}
                  </p>
                  <div className="text-right">
                    <p className="font-mono-num text-lg font-semibold text-amber">★ {balance}</p>
                    <p className="font-mono-num text-xs text-muted-foreground">{formatDollars(dollars)} owed</p>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {recent.map((e) => (
                    <div key={e.id} className="flex justify-between">
                      <span>
                        {e.kind === "earned" ? "Earned" : "Redeemed"} · {new Date(e.at).toLocaleDateString()}
                      </span>
                      <span className="font-mono-num">
                        {e.kind === "earned" ? "+" : "−"}
                        {e.points}
                      </span>
                    </div>
                  ))}
                </div>

                {redeemChild === child.id ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-amber text-white hover:bg-amber/90"
                      disabled={balance === 0 || isPending}
                      onClick={() => confirmRedeem(child.id)}
                    >
                      Confirm paid out {formatDollars(dollars)}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setRedeemChild(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={balance === 0}
                    onClick={() => setRedeemChild(child.id)}
                  >
                    Mark as redeemed
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireParentModeUnlocked, listChildren } from "@/lib/data/dal";
import { lockParentModeAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Placeholder Parent Mode dashboard — content authoring, progress charts,
// and the AI weekly summary land in task #18. requireParentModeUnlocked()
// is the real point of this page today: it proves the PIN-gate works.
export default async function ParentDashboardPage() {
  await requireParentModeUnlocked();
  const children = await listChildren();

  return (
    <div className="flex min-h-dvh flex-col items-center gap-8 bg-background px-4 py-12">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="font-display text-xl font-semibold text-primary">Parent Mode</span>
        <form action={lockParentModeAction}>
          <Button type="submit" variant="ghost" size="sm">
            Lock
          </Button>
        </form>
      </div>
      <p className="text-sm text-muted-foreground">{children.length} child profile(s) on this account.</p>
      <Link href="/profiles" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to profiles
      </Link>
    </div>
  );
}

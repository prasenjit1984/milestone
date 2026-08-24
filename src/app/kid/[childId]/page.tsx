import Link from "next/link";
import { requireChild } from "@/lib/data/dal";
import { getRewardBalance } from "@/lib/data/dashboard";

export default async function KidHomePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const child = await requireChild(childId);
  const points = await getRewardBalance(childId);

  return (
    <div className="flex min-h-dvh flex-col items-center gap-8 bg-background px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-6xl" aria-hidden>
          {child.emoji}
        </span>
        <h1 className="font-display text-2xl font-semibold">Hi, {child.name}!</h1>
        <p className="font-mono-num text-sm text-amber">★ {points} point{points === 1 ? "" : "s"}</p>
      </div>

      <div className="grid w-full max-w-sm gap-4">
        <Link
          href={`/kid/${child.id}/math`}
          className="rounded-3xl border border-border bg-math-soft p-6 text-center shadow-sm transition hover:brightness-95"
        >
          <p className="font-display text-xl font-semibold text-math">🔢 Math</p>
          <p className="mt-1 text-sm text-foreground/70">Practice numbers, shapes & patterns</p>
        </Link>
        <Link
          href={`/kid/${child.id}/reading`}
          className="rounded-3xl border border-border bg-ela-soft p-6 text-center shadow-sm transition hover:brightness-95"
        >
          <p className="font-display text-xl font-semibold text-ela">📖 Reading</p>
          <p className="mt-1 text-sm text-foreground/70">Read a passage & answer questions</p>
        </Link>
      </div>

      <Link href="/profiles" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Switch profile
      </Link>
    </div>
  );
}

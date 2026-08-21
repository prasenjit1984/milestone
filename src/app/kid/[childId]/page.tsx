import Link from "next/link";
import { requireChild } from "@/lib/data/dal";

// Placeholder kid-facing home — the real math/reading practice screens land
// in task #17 (porting the prototype's kid-facing UI to this backend).
// requireChild() is what matters here already: it's the IDOR check that
// stops one family from viewing another family's child by guessing a URL.
export default async function KidHomePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const child = await requireChild(childId);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-center">
      <span className="text-6xl" aria-hidden>
        {child.emoji}
      </span>
      <h1 className="font-display text-2xl font-semibold">Hi, {child.name}!</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Practice screens are coming next — this page already proves your sign-in and profile selection work end to end.
      </p>
      <Link href="/profiles" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Switch profile
      </Link>
    </div>
  );
}

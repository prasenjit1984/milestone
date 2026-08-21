import type { Metadata } from "next";
import Link from "next/link";
import { listChildren, getCurrentParent } from "@/lib/data/dal";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Choose a profile" };

export default async function ProfilesPage() {
  const [parent, children] = await Promise.all([getCurrentParent(), listChildren()]);

  return (
    <div className="flex min-h-dvh flex-col items-center gap-10 bg-background px-4 py-12">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="font-display text-xl font-semibold text-primary">Milestone</span>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-semibold">Welcome back, {parent.name}</h1>
        <p className="text-sm text-muted-foreground">Choose who&apos;s practicing today.</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {children.map((child) => (
          <Link key={child.id} href={`/kid/${child.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col items-center gap-3 p-8">
                <span className="text-5xl" aria-hidden>
                  {child.emoji}
                </span>
                <span className="font-display text-lg font-semibold">{child.name}</span>
                <span className="text-xs text-muted-foreground">Grade {child.grade}</span>
              </CardContent>
            </Card>
          </Link>
        ))}

        {children.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground">
            No child profiles yet — add one from Parent Mode.
          </p>
        )}
      </div>

      <Link href="/parent/gate" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Parent Mode
      </Link>
    </div>
  );
}

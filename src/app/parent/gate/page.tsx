import type { Metadata } from "next";
import Link from "next/link";
import { requireParentId } from "@/lib/data/dal";
import { isParentModeUnlocked } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PinForm } from "@/components/pin-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Parent Mode" };

export default async function ParentGatePage() {
  await requireParentId();
  if (await isParentModeUnlocked()) {
    redirect("/parent");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-xl">Parent Mode</CardTitle>
          <CardDescription>Enter your Parent PIN to open the dashboard. This unlocks for 20 minutes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PinForm />
          <Link href="/profiles" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
            Back to profiles
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

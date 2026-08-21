import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Belt-and-suspenders: proxy.ts already optimistically redirects a signed-in
  // parent away from /login, but this page re-checks independently — Proxy
  // coverage can silently change (see the Data Security guide) and this page
  // must not rely on it.
  const session = await getSession();
  if (session.parentId) {
    redirect("/profiles");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-display text-2xl font-semibold text-primary">Milestone</span>
        <p className="max-w-xs text-sm text-muted-foreground">
          Sign in to your family account to open your kids&apos; practice profiles.
        </p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-xl">Sign in</CardTitle>
          <CardDescription>There&apos;s no public sign-up — accounts are created for your family ahead of time.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}

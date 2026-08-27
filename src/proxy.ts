import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

// Routes that require a signed-in parent. `/parent/gate` is intentionally
// included here (not special-cased) — it only needs the top-level session,
// the PIN-unlock check itself happens in the DAL (requireParentModeUnlocked).
const PROTECTED_PREFIXES = ["/profiles", "/kid", "/parent"];
const PUBLIC_ONLY_ROUTES = ["/login"];

/**
 * Combines two concerns on every non-asset request:
 *
 * 1. A per-request nonce-based Content-Security-Policy (see the Next.js
 *    content-security-policy guide) — forces the whole app to render
 *    dynamically, which is fine here since every page is personalized.
 * 2. An "optimistic" auth redirect based on the session cookie alone (see
 *    the Next.js authentication guide). This is a first-pass UX nicety
 *    ONLY — it does not replace requireParentId()/requireChild() in
 *    src/lib/data/dal.ts, which every Server Component, Server Action, and
 *    Route Handler must call independently, since Proxy can be bypassed by
 *    a direct request to a Server Action.
 */
export default async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  // style-src intentionally allows 'unsafe-inline' unconditionally (not
  // nonce-gated like script-src): Radix UI primitives (Select, Popover,
  // etc.) both set inline style="" attributes for popper positioning AND
  // inject their own <style> elements for scroll-locking, neither of which
  // carry our nonce. Per the CSP spec a nonce/hash on a directive causes
  // browsers to ignore 'unsafe-inline' for that directive entirely, so
  // pairing nonce + 'unsafe-inline' here would silently keep blocking both.
  // CSS injection is a much smaller attack surface than script injection,
  // which is why script-src keeps its strict nonce + 'strict-dynamic'.
  //
  // The Google Drive Picker (src/components/parent/pdf-import-panel.tsx,
  // PDF content pipeline Stage 2) needs three additions, all scoped to
  // exactly the Google hosts involved rather than opened broadly:
  //   - frame-src docs.google.com (the Picker widget itself renders in an
  //     iframe from there) and accounts.google.com (Google Identity
  //     Services' OAuth token flow uses a hidden iframe alongside its
  //     popup window).
  //   - connect-src accounts.google.com/apis.google.com/googleapis.com for
  //     the token client and gapi loader's own requests.
  //   - style-src accounts.google.com for the small stylesheet Google
  //     Identity Services' client.js loads.
  // The two <Script> tags that load Google's JS carry our nonce (threaded
  // down from this same per-request value via parent/page.tsx →
  // DashboardShell → ContentTab → PdfImportPanel), which is what lets
  // 'strict-dynamic' trust them and everything they in turn inject,
  // without adding those hosts to script-src itself.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' https://accounts.google.com;
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self' https://accounts.google.com https://apis.google.com https://content.googleapis.com https://www.googleapis.com;
    frame-src 'self' https://docs.google.com https://accounts.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  // iron-session accepts a (Request, Response) pair directly — NextRequest /
  // NextResponse both satisfy those interfaces. We only ever read here
  // (never session.save()); this is a read-only optimistic check.
  const session = await getIronSession<SessionData>(request, response, sessionOptions());

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isPublicOnly = PUBLIC_ONLY_ROUTES.includes(pathname);

  if (isProtected && !session.parentId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isPublicOnly && session.parentId) {
    return NextResponse.redirect(new URL("/profiles", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icons|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { fraunces, publicSans, ibmPlexMono } from "@/lib/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Milestone",
    template: "%s · Milestone",
  },
  description: "A Georgia-standards-aligned practice app for math and reading, built for two kids and one parent dashboard.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Milestone",
  },
  icons: {
    icon: [
      { url: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#17201b" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // next-themes injects a small inline script (to set the theme class before
  // first paint, avoiding a flash of the wrong theme) that our nonce-based
  // CSP would otherwise block — see proxy.ts. Threading the same per-request
  // nonce through here is what makes that inline script CSP-legal.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${publicSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          {children}
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

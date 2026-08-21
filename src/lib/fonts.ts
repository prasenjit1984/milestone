import localFont from "next/font/local";

// Self-hosted via next/font/local, sourced from the @fontsource/* npm
// packages (which vendor the actual static Google Fonts .woff2 files as
// package assets) rather than next/font/google. next/font/google still
// fetches from fonts.googleapis.com at build/dev time to generate these same
// self-hosted files — this setup gets the identical end result (no runtime
// browser requests to Google, one strict same-origin CSP) without requiring
// outbound network access from wherever `next build` happens to run.
export const fraunces = localFont({
  variable: "--font-fraunces",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/fraunces/files/fraunces-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/fraunces/files/fraunces-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/fraunces/files/fraunces-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const publicSans = localFont({
  variable: "--font-public-sans",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

export const ibmPlexMono = localFont({
  variable: "--font-ibm-plex-mono",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

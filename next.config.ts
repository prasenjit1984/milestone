import type { NextConfig } from "next";

// Content-Security-Policy is set per-request (with a nonce) in proxy.ts,
// since it needs a fresh, unpredictable value on every response.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Local PDF uploads (src/lib/actions/source-content.ts) go through a
      // Server Action as multipart/form-data. Next's own default is 1MB;
      // raised to just under Vercel Functions' hard 4.5MB request-body
      // ceiling (which this config can't raise) — see MAX_UPLOAD_BYTES in
      // source-content.ts for the matching client/server-side file-size
      // check that keeps individual uploads under that hard limit.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

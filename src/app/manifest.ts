import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Milestone",
    short_name: "Milestone",
    description: "Georgia-standards-aligned math and reading practice, built for two kids and one parent dashboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ec",
    theme_color: "#23405f",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

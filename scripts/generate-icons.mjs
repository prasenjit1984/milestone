// Generates the PWA app icons from a hand-authored SVG mark (no external
// fonts or network access needed — safe to re-run any time the brand mark changes).
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(import.meta.dirname, "../public/icons");

// Navy background (matches --primary), a simple three-peak "milestone" mark in white/amber.
function svgMark({ size, padding, background = "#23405f", maskableSafe = false }) {
  const r = maskableSafe ? 0 : size * 0.22;
  const inset = maskableSafe ? size * 0.16 : padding;
  const w = size - inset * 2;
  const baseY = size - inset * 0.9;
  const peakTopY = inset + w * 0.12;
  const midY = inset + w * 0.42;

  // Three ascending peaks (a little skyline / milestone flag silhouette).
  const x0 = inset;
  const x1 = inset + w * 0.28;
  const x2 = inset + w * 0.5;
  const x3 = inset + w * 0.72;
  const x4 = inset + w;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${background}" />
  <path d="M ${x0} ${baseY} L ${x1} ${midY} L ${x2 * 0.86} ${midY + w * 0.1} L ${x2} ${peakTopY} L ${x3} ${midY} L ${x4} ${baseY} Z"
        fill="#f5f4ec" opacity="0.96" />
  <circle cx="${x2}" cy="${peakTopY - w * 0.1}" r="${w * 0.045}" fill="#c17a1f" />
</svg>`.trim();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { file: "icon-192.png", size: 192, padding: 20 },
    { file: "icon-512.png", size: 512, padding: 52 },
    { file: "apple-touch-icon.png", size: 180, padding: 18 },
    { file: "maskable-512.png", size: 512, padding: 0, maskableSafe: true },
  ];

  for (const t of targets) {
    const svg = svgMark(t);
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUT_DIR, t.file));
    console.log("wrote", t.file);
  }

  // Also write a plain favicon-sized PNG.
  await sharp(Buffer.from(svgMark({ size: 48, padding: 5 })))
    .png()
    .toFile(path.join(OUT_DIR, "icon-48.png"));
  console.log("wrote icon-48.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Regenerates public/og-image.png, the OpenGraph/Twitter social card for the
 * label browser home page. Edit the config below, then run:
 *
 *   pnpm --filter @sonasky/app-label-browser generate-og-image
 *
 * Requires `rsvg-convert` on PATH (brew install librsvg).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllLabels } from "@sonasky/labels-def";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const OUTPUT_PATH = path.join(PUBLIC_DIR, "og-image.png");
const FAVICON_PATH = path.join(PUBLIC_DIR, "sonasky_favicon.png");

const WIDTH = 1200;
const HEIGHT = 630;

// Rounds down so the badge stays true as more labels are added.
const labelCount = getAllLabels({ localesToObject: true }).length;
const roundedCount = Math.floor(labelCount / 100) * 100;

const config = {
  eyebrow: "SONASKY",
  title: "Label Browser",
  subtitle: "Find your species!",
  badgeText: `${roundedCount}+ species labels`,
  footerText: "sonasky.app · labels & feeds for Bluesky",

  colors: {
    bgTop: "#171a26",
    bgMid: "#16171d",
    bgBottom: "#101219",
    accent: "#84b0fc",
    link: "#00cadb",
    heading: "#f3f4f6",
    subheading: "#bcc3d6",
    footer: "#868c99",
    badgeText: "#b8c4ff",
    panelTop: "#ffffff",
    panelBottom: "#f4f3ec",
  },
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvg(faviconBase64: string): string {
  const { colors } = config;
  const eyebrow = escapeXml(config.eyebrow);
  const title = escapeXml(config.title);
  const subtitle = escapeXml(config.subtitle);
  const badgeText = escapeXml(config.badgeText);
  const footerText = escapeXml(config.footerText);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.bgTop}"/>
      <stop offset="60%" stop-color="${colors.bgMid}"/>
      <stop offset="100%" stop-color="${colors.bgBottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${colors.accent}" stop-opacity="0.40"/>
      <stop offset="100%" stop-color="${colors.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${colors.link}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${colors.link}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors.panelTop}"/>
      <stop offset="100%" stop-color="${colors.panelBottom}"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="230" cy="150" r="430" fill="url(#glow)"/>
  <circle cx="1080" cy="580" r="360" fill="url(#glow2)"/>
  <rect x="0" y="0" width="${WIDTH}" height="6" fill="${colors.accent}" opacity="0.55"/>

  <g transform="translate(96, 168)">
    <rect x="0" y="0" width="296" height="296" rx="52" fill="url(#panel)"/>
    <rect x="0" y="0" width="296" height="296" rx="52" fill="none" stroke="${colors.accent}" stroke-opacity="0.35" stroke-width="2"/>
    <image x="28" y="28" width="240" height="240" xlink:href="data:image/png;base64,${faviconBase64}"/>
  </g>

  <g font-family="Avenir Next, Helvetica Neue, Helvetica, sans-serif">
    <text x="448" y="232" font-size="34" font-weight="600" fill="${colors.link}" letter-spacing="5">${eyebrow}</text>
    <text x="448" y="330" font-size="80" font-weight="700" fill="${colors.heading}">${title}</text>
    <text x="448" y="394" font-size="35" font-weight="500" fill="${colors.subheading}">${subtitle}</text>

    <g transform="translate(448, 436)">
      <rect x="0" y="0" width="330" height="58" rx="29" fill="${colors.accent}" fill-opacity="0.16" stroke="${colors.accent}" stroke-opacity="0.55" stroke-width="2"/>
      <text x="28" y="38" font-size="27" font-weight="600" fill="${colors.badgeText}">${badgeText}</text>
    </g>

    <text x="448" y="546" font-size="28" font-weight="500" fill="${colors.footer}">${footerText}</text>
  </g>
</svg>`;
}

function main() {
  const faviconBase64 = readFileSync(FAVICON_PATH).toString("base64");
  const svg = buildSvg(faviconBase64);

  const tmpDir = mkdtempSync(path.join(tmpdir(), "og-image-"));
  const svgPath = path.join(tmpDir, "og.svg");
  writeFileSync(svgPath, svg);

  try {
    execFileSync("rsvg-convert", [
      "-w",
      String(WIDTH),
      "-h",
      String(HEIGHT),
      svgPath,
      "-o",
      OUTPUT_PATH,
    ]);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        "rsvg-convert not found on PATH. Install it with `brew install librsvg` (macOS) or your package manager's equivalent.",
      );
      process.exit(1);
    }
    throw err;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(
    `Wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (${labelCount} labels, badge rounded to ${roundedCount}+)`,
  );
}

main();

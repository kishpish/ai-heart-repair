// Screenshot the site for review.
//   cd .. && python3 -m http.server 8765      (serve the parent folder so the site sits at /ai-heart-repair/)
//   node tools/shots.mjs [outDir] [baseUrl]
// Writes full-page and per-section screenshots at desktop and phone sizes and
// prints console errors, failed requests and horizontal overflow.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const out = process.argv[2] || "shots";
const base = process.argv[3] || "http://localhost:8765/ai-heart-repair/";
mkdirSync(out, { recursive: true });

const sizes = [
  { name: "desktop", width: 1440, height: 900, scale: 1 },
  { name: "phone", width: 390, height: 844, scale: 2, mobile: true },
];
const sections = ["top", "problem", "method", "results", "impact", "next", "posters", "paper", "about"];

const browser = await chromium.launch();
for (const s of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.scale,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()}: ${r.url()}`));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const id of sections) {
    await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" }), id);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${s.name}-${id}.png` });
  }
  const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
  if (overflow.doc > overflow.win + 1) problems.push(`horizontal overflow: ${overflow.doc} > ${overflow.win}`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${s.name}-full.png`, fullPage: true });
  console.log(`${s.name}: ${problems.length ? problems.join("\n  ") : "no problems"}`);
  await ctx.close();
}
await browser.close();

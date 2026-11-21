// Regenerate the share image and icons.
//   cd .. && python3 -m http.server 8765
//   node tools/make_meta.mjs && python3 tools/make_ico.py
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:8765/ai-heart-repair/";

const browser = await chromium.launch();
// Share image: the hero drawing, held still (reduced motion gives the end-diastolic frame).
let ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
let page = await ctx.newPage();
await page.goto(base + "tools/og.html", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: "assets/meta/og.png" });
await ctx.close();

for (const size of [32, 180, 192, 512]) {
  ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  await page.setContent(`<style>html,body{margin:0;background:#0d0c0b}img{display:block;width:${size}px;height:${size}px}</style><img src="${base}favicon.svg">`, { waitUntil: "networkidle" });
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await page.screenshot({ path: `assets/meta/${name}` });
  await ctx.close();
}
await browser.close();
console.log("wrote assets/meta/og.png and icons");

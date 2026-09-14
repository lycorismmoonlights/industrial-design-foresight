// Run against an already running local server: node scripts/export-showcase.mjs
// This exports curated presentation content only, without an owner session.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.SHOWCASE_URL ?? "http://localhost:3000/showcase";
const outputDir = resolve("output/pdf");
const qaDir = resolve("work/showcase");
await mkdir(outputDir, { recursive: true });
await mkdir(qaDir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`Presentation returned HTTP ${response?.status()}`);
  await page.locator(".pitch-role-grid").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(qaDir, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(qaDir, "mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.pdf({ path: resolve(outputDir, "foresight-collaboration.pdf"), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:8px;color:#687a62;width:100%;padding:0 60px;display:flex;justify-content:space-between"><span>工业设计前瞻站 · 跨学院共研计划 / 2026.09</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  console.log(`Exported ${resolve(outputDir, "foresight-collaboration.pdf")}`);
} finally {
  await browser.close();
}

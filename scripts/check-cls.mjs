/**
 * Measures cumulative layout shift on the board — the column scroller and the
 * card entry animation are the two things most likely to cause it.
 *
 *   node scripts/check-cls.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const ROUTES = [
  "/board?pipeline=resi&view=board",
  "/board?pipeline=comm&view=board",
  "/board?pipeline=resi&view=list",
];
// Google's "good" threshold. The board should be far under it.
const BUDGET = 0.1;

async function main() {
  const browser = await chromium.launch();
  let worst = 0;

  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__cls += entry.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    // Let the card-entry animation and any late fonts settle.
    await page.waitForTimeout(2500);
    await page.mouse.wheel(600, 0);
    await page.waitForTimeout(800);

    const cls = await page.evaluate(() => window.__cls);
    worst = Math.max(worst, cls);
    console.log(`${cls.toFixed(4)}  ${route}`);
    await page.close();
  }

  await browser.close();

  if (worst > BUDGET) {
    console.log(`\nFAIL: worst CLS ${worst.toFixed(4)} exceeds ${BUDGET}`);
    process.exitCode = 1;
  } else {
    console.log(`\nOK: worst CLS ${worst.toFixed(4)} (budget ${BUDGET})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

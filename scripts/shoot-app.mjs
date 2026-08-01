/**
 * Screenshots the running app, one image per screen, for side-by-side
 * comparison against `screenshots/prototype/`. Not part of the product.
 *
 *   pnpm build && pnpm start -p 3000
 *   node scripts/shoot-app.mjs            # or BASE=http://… node scripts/shoot-app.mjs
 *
 * Plain ESM on purpose: tsx's esbuild transform injects a `__name` helper into
 * functions passed to page.evaluate, which then throws in the browser.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = fileURLToPath(new URL("../screenshots/app/", import.meta.url));

const SHOTS = [
  { name: "board", path: "/board?pipeline=resi&view=board" },
  { name: "list", path: "/board?pipeline=resi&view=list" },
  { name: "board-comm", path: "/board?pipeline=comm&view=board" },
  { name: "board-partner", path: "/board?pipeline=partner&view=board" },
  { name: "approvals", path: "/approvals" },
  { name: "field", path: "/field" },
  { name: "record", path: "/record/r1" },
  { name: "manager", path: "/manager" },
  { name: "switcher", path: "/switcher" },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];

  // Desktop pass at the 1440px review width.
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${String(e)}`));

  for (const shot of SHOTS) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.screenshot({
      path: join(OUT, `${shot.name}.png`),
      fullPage: true,
    });
    console.log(`captured ${shot.name}`);
  }
  await page.close();

  // Field at a real phone viewport — the primary rendering for that screen.
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  phone.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console 390] ${m.text()}`);
  });
  phone.on("pageerror", (e) => problems.push(`[pageerror 390] ${String(e)}`));
  await phone.goto(`${BASE}/field`, { waitUntil: "networkidle" });
  await phone.waitForTimeout(900);
  await phone.screenshot({ path: join(OUT, "field-390.png"), fullPage: true });
  // A page that scrolls sideways at 390px is broken, so assert it here.
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) problems.push(`[390px] horizontal overflow ${overflow}px`);
  console.log("captured field-390");
  await phone.close();

  await browser.close();

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log("  " + p);
    process.exitCode = 1;
  } else {
    console.log("\nconsole clean on every route");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

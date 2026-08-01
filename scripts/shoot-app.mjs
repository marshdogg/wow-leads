/**
 * Screenshots the running app, one image per screen, for side-by-side
 * comparison against `screenshots/prototype/`. Also asserts the two things a
 * screenshot can't show: a clean console, and no horizontal overflow at a
 * phone viewport. Not part of the product.
 *
 *   pnpm build && pnpm start -p 3000
 *   node scripts/shoot-app.mjs            # or BASE=https://… node scripts/shoot-app.mjs
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

const DESKTOP_ROUTES = [
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

/**
 * /field is the designated mobile surface, but no route may scroll sideways —
 * /record in particular carries the access notes a rep reads at the gate.
 */
const PHONE_ROUTES = [
  { name: "field-390", path: "/field" },
  { name: "record-390", path: "/record/r1" },
  { name: "manager-390", path: "/manager" },
  { name: "board-390", path: "/board?pipeline=resi&view=board" },
];

/**
 * documentElement.scrollWidth alone is not enough — it clamps to the viewport
 * while body and individual elements still overflow, either scrolling the page
 * sideways or getting silently clipped.
 *
 * Elements inside a horizontal scroller don't count: the board's column strip
 * is *meant* to run past the viewport, and the user can reach all of it. What
 * this is looking for is content that escapes the page with no way to scroll
 * to it — the two-column record grid at 390px, where the right column is cut
 * off and unreachable.
 */
async function measureOverflow(page) {
  const m = await page.evaluate(() => {
    // Exactly one horizontal scroller is intentional: the board's column
    // strip, which is *designed* to run past the viewport. Naming it rather
    // than exempting any `overflow-x: auto` ancestor keeps the check honest —
    // a generic rule also excuses the clipped two-column record grid.
    const contained = (el) => Boolean(el.closest('[data-testid="board-columns"]'));
    const widest = Array.from(document.querySelectorAll("*")).reduce(
      (max, el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 20 || contained(el)) return max;
        return Math.max(max, r.right);
      },
      0,
    );
    return {
      body: document.body.scrollWidth - window.innerWidth,
      doc: document.documentElement.scrollWidth - window.innerWidth,
      widest: Math.round(widest) - window.innerWidth,
    };
  });
  return { ...m, worst: Math.max(m.body, m.doc, m.widest) };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];

  const watch = (page, tag) => {
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`[console ${tag}] ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`[pageerror ${tag}] ${e}`));
  };

  // Desktop pass at the 1440px review width.
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  watch(page, "1440");

  for (const shot of DESKTOP_ROUTES) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.screenshot({
      path: join(OUT, `${shot.name}.png`),
      fullPage: true,
    });
    console.log(`captured ${shot.name}`);
  }
  await page.close();

  // Phone pass.
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  watch(phone, "390");

  for (const shot of PHONE_ROUTES) {
    await phone.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    await phone.waitForTimeout(900);
    await phone.screenshot({
      path: join(OUT, `${shot.name}.png`),
      fullPage: true,
    });
    const over = await measureOverflow(phone);
    if (over.worst > 1) {
      problems.push(
        `[390px] ${shot.path} overflows ${over.worst}px ` +
          `(body ${over.body}, doc ${over.doc}, widest element ${over.widest})`,
      );
    }
    console.log(`captured ${shot.name}  overflow ${over.worst}px`);
  }
  await phone.close();

  await browser.close();

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log("  " + p);
    process.exitCode = 1;
  } else {
    console.log("\nconsole clean on every route, no overflow at 390px");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

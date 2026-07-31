/**
 * Renders the design-reference prototype in Chromium and captures one
 * screenshot per screen. These are the ground truth the rebuilt screens are
 * compared against during the fidelity pass. Not part of the product.
 *
 *   node scripts/shoot-prototype.mjs
 *
 * Plain ESM on purpose: tsx's esbuild transform injects a `__name` helper into
 * functions passed to page.evaluate, which then throws in the browser.
 */
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const REFS = fileURLToPath(new URL("../design-refs/", import.meta.url));
const OUT = fileURLToPath(new URL("../screenshots/prototype/", import.meta.url));
const PORT = 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path === "/" ? "WOW Leads v3.dc.html" : path.replace(/^\//, "");
  try {
    const body = await readFile(join(REFS, file));
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const SCREENS = [
  { name: "board", nav: "Pipelines" },
  { name: "approvals", nav: "Approvals" },
  { name: "field", nav: "Field view" },
  { name: "manager", nav: "Manager dashboard" },
];

/**
 * The prototype wires click handlers onto plain divs, so Playwright's
 * semantic locators don't see them. Match on trimmed textContent and click.
 */
function clickByText(text) {
  const nodes = Array.from(document.querySelectorAll("div,span,button")).reverse();
  // Innermost match wins — outer wrappers share the same textContent. Fall
  // back to a contains match for controls that prefix a glyph ("▤ Board").
  const el =
    nodes.find((n) => n.textContent.trim() === text) ??
    nodes.find((n) => {
      const t = n.textContent.trim();
      return t.includes(text) && t.length <= text.length + 3;
    });
  if (!el) return false;
  el.click();
  return true;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1040 },
    deviceScaleFactor: 2,
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const clickText = async (label) => {
    const hit = await page.evaluate(clickByText, label);
    if (!hit) throw new Error(`no element with text "${label}"`);
    await page.waitForTimeout(900);
  };

  for (const screen of SCREENS) {
    await clickText(screen.nav);
    await page.screenshot({
      path: join(OUT, `${screen.name}.png`),
      fullPage: true,
    });
    console.log(`captured ${screen.name}`);
  }

  await clickText("Pipelines");
  await clickText("List");
  await page.screenshot({ path: join(OUT, "list.png"), fullPage: true });
  console.log("captured list");

  await clickText("Board");
  await clickText("Delia Marchetti");
  await page.screenshot({ path: join(OUT, "record.png"), fullPage: true });
  console.log("captured record");

  // Commercial and Partner boards, for the Switcher comparison.
  await clickText("Pipelines");
  await clickText("Commercial Bid");
  await page.screenshot({ path: join(OUT, "board-comm.png"), fullPage: true });
  await clickText("Industry Partner");
  await page.screenshot({
    path: join(OUT, "board-partner.png"),
    fullPage: true,
  });
  console.log("captured commercial + partner boards");

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});

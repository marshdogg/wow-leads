import { execFileSync } from "node:child_process";

/**
 * Puts the database in a known state before the suite runs.
 *
 * These tests approve drafts, drag cards and save notes — they mutate the same
 * database the app reads. Without this the suite is order-dependent: the
 * signature-flow test clears r1's AI-drafted state, and the list-view test
 * that asserts the green AI rail then fails for a reason that has nothing to
 * do with the list view.
 *
 * Board preferences need resetting too, and separately. `pnpm seed`
 * deliberately leaves them alone — collapse state and list sort are a person's
 * saved preferences, not demo fixtures, so a re-seed shouldn't wipe them (see
 * DECISIONS.md). That's right for the demo and wrong for a test run: a
 * collapsed column persists from a previous run, the collapsed card renders
 * only its summary, and a test asserting on a metric strip fails for a reason
 * that has nothing to do with what it is testing. Exactly that cost an
 * investigation, so the reset lives here rather than in the seed.
 */
export default function globalSetup() {
  // No explicit cwd: Playwright runs global setup from the project root, and
  // this file is transpiled to CJS, where import.meta is unavailable.
  execFileSync("pnpm", ["seed"], { stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "scripts/reset-prefs.ts"], {
    stdio: "inherit",
  });
}

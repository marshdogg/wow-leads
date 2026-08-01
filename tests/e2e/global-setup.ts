import { execFileSync } from "node:child_process";

/**
 * Re-seeds the database before the suite runs.
 *
 * These tests approve drafts, drag cards and save notes — they mutate the same
 * database the app reads. Without this the suite is order-dependent: the
 * signature-flow test clears r1's AI-drafted state, and the list-view test
 * that asserts the green AI rail then fails for a reason that has nothing to
 * do with the list view. Seeding first makes every run start from the state
 * the prototype describes.
 */
export default function globalSetup() {
  // No explicit cwd: Playwright runs global setup from the project root, and
  // this file is transpiled to CJS, where import.meta is unavailable.
  execFileSync("pnpm", ["seed"], { stdio: "inherit" });
}

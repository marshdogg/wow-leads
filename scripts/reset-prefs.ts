/**
 * Resets every user's board preferences to the opening state — nothing
 * collapsed, sorted by next action.
 *
 * Kept out of `pnpm seed` on purpose: collapse state and list sort are a
 * person's saved preferences rather than demo fixtures, so a re-seed leaves
 * them alone (see DECISIONS.md). Test runs and demo resets want the opposite,
 * so they call this.
 *
 *   pnpm exec tsx scripts/reset-prefs.ts
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

config({ path: ".env.local" });

const DEFAULT_PREFS = {
  collapsedCols: {},
  listSort: { key: "next", dir: 1 },
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const db = drizzle(neon(url));
  await db.execute(
    sql`update users set board_prefs = ${JSON.stringify(DEFAULT_PREFS)}::jsonb`,
  );
  console.log("Board preferences reset: nothing collapsed, sorted by next action.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

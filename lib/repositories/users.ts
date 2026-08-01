/**
 * Per-user state. Collapse state and list sort persist per user (handoff spec
 * "State"), so they live on the user row rather than in localStorage.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { appendAudit } from "./audit";
import type { BoardPrefs, ListSortKey } from "@/lib/types";

const DEFAULT_PREFS: BoardPrefs = {
  collapsedCols: {},
  listSort: { key: "next", dir: 1 },
};

const SORT_KEYS: ListSortKey[] = [
  "name",
  "track",
  "stage",
  "next",
  "owner",
  "stale",
];

export async function getBoardPrefs(userId: string): Promise<BoardPrefs> {
  const [row] = await db
    .select({ boardPrefs: users.boardPrefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return DEFAULT_PREFS;

  const stored = row.boardPrefs;
  const key = SORT_KEYS.includes(stored.listSort.key as ListSortKey)
    ? (stored.listSort.key as ListSortKey)
    : "next";

  return {
    collapsedCols: stored.collapsedCols ?? {},
    listSort: { key, dir: stored.listSort.dir === -1 ? -1 : 1 },
  };
}

/**
 * Saves board preferences, merging rather than replacing.
 *
 * Takes a partial on purpose. Collapse state and list sort are edited on
 * different screens, and writing the whole document meant the second save
 * clobbered the first: collapse a column, move to the list view before that
 * write lands, sort a column, and the sort save writes back the stale
 * `collapsedCols` the list page had loaded. Last write wins, the collapse is
 * gone, and it only reproduces when the database is slow enough for the two to
 * overlap — which is why it looked like flaky infrastructure for hours rather
 * than the race it is.
 *
 * The merge is `||`, a shallow top-level jsonb merge, which is exactly right:
 * the two keys are independent and each caller owns its whole key.
 */
export async function saveBoardPrefs(
  userId: string,
  prefs: Partial<BoardPrefs>,
): Promise<void> {
  const before = await getBoardPrefs(userId);

  const patch: Record<string, unknown> = {};
  if (prefs.collapsedCols) patch.collapsedCols = prefs.collapsedCols;
  if (prefs.listSort) {
    patch.listSort = { key: prefs.listSort.key, dir: prefs.listSort.dir };
  }
  if (!Object.keys(patch).length) return;

  await db
    .update(users)
    .set({
      boardPrefs: sql`coalesce(${users.boardPrefs}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(users.id, userId));

  await appendAudit({
    entity: "user",
    entityId: userId,
    action: "save_board_prefs",
    userId,
    before,
    after: prefs,
  });
}

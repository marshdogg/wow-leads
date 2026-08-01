/**
 * Per-user state. Collapse state and list sort persist per user (handoff spec
 * "State"), so they live on the user row rather than in localStorage.
 */

import { eq } from "drizzle-orm";
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

export async function saveBoardPrefs(
  userId: string,
  prefs: BoardPrefs,
): Promise<void> {
  const before = await getBoardPrefs(userId);

  await db
    .update(users)
    .set({
      boardPrefs: {
        collapsedCols: prefs.collapsedCols,
        listSort: { key: prefs.listSort.key, dir: prefs.listSort.dir },
      },
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

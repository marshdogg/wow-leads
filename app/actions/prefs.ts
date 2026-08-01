"use server";

/**
 * Board preferences — collapsed columns and list sort — persisted per user so
 * a rep's layout survives a reload and a device change.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { getBoardPrefs, saveBoardPrefs } from "@/lib/repositories/users";
import type { BoardPrefs } from "@/lib/types";

// Partial on purpose: each screen saves only the preference it owns, so a
// sort save cannot clobber collapse state. The repository merges.
const prefsSchema = z.object({
  collapsedCols: z.record(z.string(), z.boolean()).optional(),
  listSort: z
    .object({
      key: z.enum(["name", "track", "stage", "next", "owner", "stale"]),
      dir: z.union([z.literal(1), z.literal(-1)]),
    })
    .optional(),
});

export type PrefsResult =
  | { ok: true; prefs: BoardPrefs }
  | { ok: false; error: string };

export async function saveBoardPrefsAction(
  input: z.input<typeof prefsSchema>,
): Promise<PrefsResult> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid board preferences." };

  try {
    const userId = getCurrentUser().id;
    await saveBoardPrefs(userId, parsed.data);
    revalidatePath("/");
    revalidatePath("/board");
    // The merged document, not the patch — a caller that saved only its sort
    // should still receive the collapse state that survived alongside it.
    return { ok: true, prefs: await getBoardPrefs(userId) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not save your preferences.",
    };
  }
}

export async function getBoardPrefsAction(): Promise<BoardPrefs> {
  return getBoardPrefs(getCurrentUser().id);
}

import { TRACK_STYLE } from "@/lib/pipelines";
import type { Deal, ListSort, ListSortKey } from "@/lib/types";

/**
 * List-view sort comparators — a direct port of the prototype's `sortVal`
 * (WOW Leads v3.dc.html lines 1167–1175).
 *
 * Every key resolves to a *string*, so one comparator serves all six columns
 * and the sort stays stable and total. The encodings are deliberate:
 *
 * - `track` falls back to `"zz"` so untracked deals sort after every chip
 *   label (which are all upper-case, and so below lower-case `z`).
 * - `stage` is the pipeline index zero-padded to two digits, so stage order is
 *   pipeline order rather than alphabetical.
 * - `next` prefixes `0`/`1`/`2` for overdue / scheduled / unset, then appends
 *   the due string — overdue first, then by due date, unset last.
 */

/** Sort value for a deal with no track. Sorts after every real track label. */
export const UNTRACKED_SORT_VALUE = "zz";

/** Stage index used when a deal sits on a stage outside `stageOrder`. */
export const UNKNOWN_STAGE_INDEX = 99;

export function sortValue(
  deal: Deal,
  key: ListSortKey,
  stageOrder: string[],
): string {
  switch (key) {
    case "name":
      return deal.name.toLowerCase();
    case "track": {
      const track = deal.track ? TRACK_STYLE[deal.track] : undefined;
      return track ? track.label : UNTRACKED_SORT_VALUE;
    }
    case "stage": {
      const i = stageOrder.indexOf(deal.stage);
      return String(i === -1 ? UNKNOWN_STAGE_INDEX : i).padStart(2, "0");
    }
    case "owner":
      return (deal.owner.name || "").toLowerCase();
    case "stale":
      return deal.initialType || deal.stale || "";
    case "next":
      return (
        (deal.next ? (deal.next.state === "overdue" ? "0" : "1") : "2") +
        (deal.next ? deal.next.due : "")
      );
  }
}

export function compareDeals(
  a: Deal,
  b: Deal,
  sort: ListSort,
  stageOrder: string[],
): number {
  const va = sortValue(a, sort.key, stageOrder);
  const vb = sortValue(b, sort.key, stageOrder);
  if (va < vb) return -sort.dir;
  if (va > vb) return sort.dir;
  return 0;
}

/** Non-mutating: returns a new array. Ties keep their input order. */
export function sortDeals(
  deals: Deal[],
  sort: ListSort,
  stageOrder: string[],
): Deal[] {
  return deals.slice().sort((a, b) => compareDeals(a, b, sort, stageOrder));
}

/**
 * Clicking a header sorts ascending; clicking the active header reverses it.
 */
export function nextSort(current: ListSort, key: ListSortKey): ListSort {
  return {
    key,
    dir: current.key === key ? ((-current.dir) as 1 | -1) : 1,
  };
}

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { SUPPRESSION_ACTION } from "@/lib/agents/approval-machine";
import type { TriggerType } from "@/lib/types";

/**
 * Skip suppression.
 *
 * When a human skips a drafted touchpoint they are making a decision, and the
 * system honours it for 90 days. This reads those decisions back off the
 * audit trail so a runner never re-asks a question that has already been
 * answered.
 *
 * There is no suppression table on purpose — a skip is provenance ("we chose
 * not to contact them, and here is when that expires"), and the audit trail
 * is where provenance lives.
 */

interface SuppressionPayload {
  triggerType?: unknown;
  suppressedUntil?: unknown;
}

/** Keys are `dealId:triggerType`. */
export type SuppressionIndex = ReadonlySet<string>;

export function suppressionKey(dealId: string, triggerType: TriggerType): string {
  return `${dealId}:${triggerType}`;
}

/**
 * Every (deal, trigger) pair still inside its cooling window. Loaded once per
 * cron run rather than queried per deal — the runners check a set, not the
 * database.
 */
export async function loadSuppressions(
  dealIds: string[],
  now: Date,
): Promise<SuppressionIndex> {
  const suppressed = new Set<string>();
  if (dealIds.length === 0) return suppressed;

  const rows = await db
    .select({ entityId: auditEvents.entityId, after: auditEvents.after })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entity, "deal"),
        eq(auditEvents.action, SUPPRESSION_ACTION),
        inArray(auditEvents.entityId, dealIds),
      ),
    );

  for (const row of rows) {
    const payload = row.after as SuppressionPayload | null;
    if (!payload) continue;
    const { triggerType, suppressedUntil } = payload;
    if (typeof triggerType !== "string" || typeof suppressedUntil !== "string") {
      continue;
    }
    // A window that has run out is history, not a block.
    if (new Date(suppressedUntil).getTime() <= now.getTime()) continue;
    suppressed.add(`${row.entityId}:${triggerType}`);
  }

  return suppressed;
}

export function isSuppressed(
  index: SuppressionIndex,
  dealId: string,
  triggerType: TriggerType,
): boolean {
  return index.has(suppressionKey(dealId, triggerType));
}

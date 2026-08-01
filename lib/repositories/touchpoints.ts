/**
 * The activity timeline. A logged touchpoint is the one write that moves the
 * board on its own: it refreshes the deal's last-touch and, when the caller
 * asks for it, pushes the next action out by a default number of days — that
 * is what makes one-tap quick logging viable from a driveway.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, touchpoints } from "@/db/schema";
import { appendAudit } from "./audit";
import { toTouchpoint } from "./mappers";
import { formatDue } from "./rules";
import type { Touchpoint, TouchpointChannel } from "@/lib/types";

const MS_DAY = 86_400_000;

export async function getTimeline(dealId: string): Promise<Touchpoint[]> {
  const rows = await db
    .select()
    .from(touchpoints)
    .where(eq(touchpoints.dealId, dealId))
    .orderBy(desc(touchpoints.occurredAt));
  return rows.map(toTouchpoint);
}

export interface LogTouchpointInput {
  dealId: string;
  channel: TouchpointChannel;
  body: string;
  /** Both may be set: an agent drafted it, a human approved the send. */
  actorUserId?: string;
  agentId?: string;
  /**
   * Overrides the derived display line. Approved AI sends need the compound
   * form — "Re-marketing agent · approved by Marshall Behrns" — because both
   * halves are true and a reader has to know which is which.
   */
  who?: string;
  byAgent?: boolean;
  initials?: string;
  structured?: { label: string; value: string }[] | null;
  /** Push the next action out by this many days, e.g. quick-log sets +2. */
  advanceNextActionDays?: number;
}

export async function logTouchpoint(
  input: LogTouchpointInput,
): Promise<Touchpoint> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(eq(deals.id, input.dealId))
    .limit(1);
  if (!deal) throw new Error(`Deal "${input.dealId}" not found.`);

  const byAgent = input.byAgent ?? !!input.agentId;
  const who =
    input.who ??
    (byAgent
      ? deal.ownerIsAgent
        ? deal.ownerName
        : "WOW Leads automation"
      : deal.ownerName);
  const initials = input.initials ?? (byAgent ? "AI" : deal.ownerInitials);

  const now = new Date();
  const [row] = await db
    .insert(touchpoints)
    .values({
      id: `tp-${crypto.randomUUID()}`,
      dealId: input.dealId,
      accountId: deal.accountId,
      channel: input.channel,
      body: input.body,
      who,
      byAgent,
      initials,
      userId: input.actorUserId ?? null,
      agentId: input.agentId ?? null,
      structured: input.structured ?? null,
      occurredAt: now,
    })
    .returning();

  // The card's last-touch line and the neglect query must move together.
  const dealUpdate: Partial<typeof deals.$inferInsert> = {
    stale: "touched today",
    staleWarn: false,
    lastTouchAt: now,
    updatedAt: now,
  };

  if (input.advanceNextActionDays !== undefined) {
    const dueAt = new Date(now.getTime() + input.advanceNextActionDays * MS_DAY);
    dueAt.setHours(9, 0, 0, 0);
    dealUpdate.nextLabel = deal.nextLabel ?? `Follow up on the ${input.channel.toLowerCase()}`;
    dealUpdate.nextDue = formatDue(dueAt);
    dealUpdate.nextState = "ok";
    dealUpdate.nextDueAt = dueAt;
  }

  await db.update(deals).set(dealUpdate).where(eq(deals.id, input.dealId));

  // An audit row names one actor. When an agent drafted and a human approved,
  // the human is the actor — they made the decision — and the drafting agent
  // rides along in the payload so the trail still shows both.
  await appendAudit({
    entity: "touchpoint",
    entityId: row.id,
    action: "log",
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? null),
    before: null,
    after: {
      dealId: input.dealId,
      channel: input.channel,
      body: input.body,
      draftedByAgentId: input.agentId ?? null,
      nextDue: dealUpdate.nextDue ?? deal.nextDue,
    },
  });

  return toTouchpoint(row);
}

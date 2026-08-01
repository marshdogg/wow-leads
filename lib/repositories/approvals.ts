/**
 * The approval queue. Reads only — the approve / edit / skip state machine
 * lives in `lib/agents/approval-machine.ts` and composes the deal and
 * touchpoint primitives directly, so there is deliberately no `decideApproval`
 * here for it to duplicate.
 */

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { toApproval } from "./mappers";
import type { Approval, ApprovalStatus } from "@/lib/types";

/** Statuses that still need a human: the queue the Approvals page renders. */
const PENDING: ApprovalStatus[] = ["drafted", "edited"];

/** Oldest first — the queue is worked top-down. */
export async function getPendingApprovals(): Promise<Approval[]> {
  const rows = await db
    .select()
    .from(approvals)
    .where(inArray(approvals.status, PENDING))
    .orderBy(asc(approvals.createdAt), asc(approvals.id));
  return rows.map(toApproval);
}

export async function getApprovalsForDeal(dealId: string): Promise<Approval[]> {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.dealId, dealId))
    .orderBy(asc(approvals.createdAt));
  return rows.map(toApproval);
}

export async function getPendingApprovalCount(): Promise<number> {
  return (await getPendingApprovals()).length;
}

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { appendAudit } from "@/lib/repositories/audit";
import { setAiPending, setNextAction } from "@/lib/repositories/deals";
import { toApproval } from "@/lib/repositories/mappers";
import { formatDue } from "@/lib/repositories/rules";
import { logTouchpoint } from "@/lib/repositories/touchpoints";
import { addDays } from "@/lib/triggers/dates";
import type { AgentId } from "@/lib/triggers/types";
import type {
  Approval,
  ApprovalStatus,
  Deal,
  TouchpointChannel,
  TriggerType,
} from "@/lib/types";

/**
 * The approval state machine.
 *
 * The product's central promise is that nothing sends until a human approves
 * it. That promise is only as good as this file: it is the single place an
 * approval changes state, and it refuses every transition that is not one of
 * the three legal paths.
 *
 *   drafted → approved → sent
 *   drafted → edited  → sent
 *   drafted → skipped
 *
 * Anything else throws. In particular a `sent` approval can never be sent
 * again and a `skipped` one can never be revived — an approval is a record of
 * a decision a person made, not a mutable draft.
 */

export { APPROVAL_TOASTS, toastFor } from "./approval-toasts";
export type { ApprovalDecision } from "./approval-toasts";

import { APPROVAL_TOASTS } from "./approval-toasts";
import type { ApprovalDecision } from "./approval-toasts";

export const LEGAL_TRANSITIONS: Readonly<
  Record<ApprovalStatus, readonly ApprovalStatus[]>
> = {
  drafted: ["approved", "edited", "skipped"],
  approved: ["sent"],
  edited: ["sent"],
  sent: [],
  skipped: [],
};

/** The status chain each decision walks, in order. */
export const DECISION_PATHS: Readonly<
  Record<ApprovalDecision, readonly ApprovalStatus[]>
> = {
  approve: ["approved", "sent"],
  edit: ["edited", "sent"],
  skip: ["skipped"],
};

export class IllegalApprovalTransitionError extends Error {
  constructor(
    readonly from: ApprovalStatus,
    readonly to: ApprovalStatus,
  ) {
    super(`Illegal approval transition: ${from} → ${to}`);
    this.name = "IllegalApprovalTransitionError";
  }
}

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!canTransition(from, to)) throw new IllegalApprovalTransitionError(from, to);
}

/**
 * Validate a whole decision against a starting status and return the chain it
 * walks. Throws on the first illegal hop, so an already-sent approval cannot
 * be re-approved and a skipped one cannot be edited into life.
 */
export function assertDecision(
  from: ApprovalStatus,
  decision: ApprovalDecision,
): ApprovalStatus[] {
  const path = DECISION_PATHS[decision];
  let current = from;
  for (const next of path) {
    assertTransition(current, next);
    current = next;
  }
  return [...path];
}

/** The terminal status a decision lands on. */
export function finalStatus(decision: ApprovalDecision): ApprovalStatus {
  const path = DECISION_PATHS[decision];
  return path[path.length - 1];
}

/*
 * Toast copy lives in `./approval-toasts` (re-exported above) so that client
 * components can read the strings without importing this module's database
 * client. The `edit` toast fires when the inline editor opens, not when the
 * edited message sends — an edit that has actually gone out reports the
 * approve toast, because it did the same thing.
 */

/* -------------------------------------------------------------------------
   Suppression
   ------------------------------------------------------------------------- */

/**
 * A skip is a decision, and the system has to respect it. Ninety days is long
 * enough that the rep is not asked the same question next Tuesday and short
 * enough that a genuinely good lead comes back around.
 */
export const SUPPRESSION_DAYS = 90;

export function suppressionUntil(now: Date): Date {
  return addDays(now, SUPPRESSION_DAYS);
}

/**
 * There is no suppression table, so the audit trail is the store of record —
 * which is the right place for it anyway: "we chose not to contact them, and
 * here is when that expires" is provenance, not configuration. The trigger
 * runners read these back through `lib/triggers/suppression.ts`.
 */
export const SUPPRESSION_ACTION = "trigger.suppressed";

export interface SuppressionRecord {
  triggerType: TriggerType;
  approvalId: string;
  suppressedUntil: string;
}

/* -------------------------------------------------------------------------
   Next action
   ------------------------------------------------------------------------- */

interface PlannedNextAction {
  label: string;
  dueAt: Date;
}

/**
 * What the rep does next once the message is out. Approving is not the end of
 * the touchpoint — it is the start of waiting for a reply, and an unanswered
 * send with no next action set is exactly the neglect this product exists to
 * stop.
 */
export function nextActionFor(approval: Approval, now: Date): PlannedNextAction {
  switch (approval.triggerType) {
    case "eleven_month":
      return {
        label: "Confirm the warranty visit",
        dueAt: addDays(now, 3),
      };
    case "seasonal":
      return {
        label: "Check for a reply before the offer expires",
        dueAt: addDays(now, 3),
      };
    case "revival":
      return { label: "Revival call — follow the message up", dueAt: addDays(now, 2) };
    case "sequence":
      return { label: "Next sequence step", dueAt: addDays(now, 3) };
  }
}

/* -------------------------------------------------------------------------
   The decision
   ------------------------------------------------------------------------- */

export interface DecideInput {
  approvalId: string;
  decision: ApprovalDecision;
  /** Required for `edit`: the body the human actually wants to send. */
  body?: string;
  actorUserId: string;
  /** Injectable for tests. */
  now?: Date;
}

export interface DecideResult {
  approval: Approval;
  deal: Deal;
  toast: string;
}

export async function decide(input: DecideInput): Promise<DecideResult> {
  const now = input.now ?? new Date();
  const { approval, agentId } = await loadApproval(input.approvalId);

  // Validate the whole path before writing anything.
  assertDecision(approval.status, input.decision);

  if (input.decision === "edit" && !input.body?.trim()) {
    throw new Error("editAndSend: an edited approval needs a body to send.");
  }

  return input.decision === "skip"
    ? skip(approval, input.actorUserId, now)
    : send(approval, agentId, input, now);
}

/** approve and edit differ only in whose words go out. */
async function send(
  approval: Approval,
  agentId: AgentId,
  input: DecideInput,
  now: Date,
): Promise<DecideResult> {
  const edited = input.decision === "edit";
  const body = edited ? input.body!.trim() : approval.body;

  const updated = await writeStatus({
    approvalId: approval.id,
    status: "sent",
    body,
    decidedBy: input.actorUserId,
    decidedAt: now,
  });

  // Passing both actors is what produces the compound provenance line the
  // Record timeline renders — "Re-marketing agent · approved by Marshall
  // Behrns" — naming the agent that drafted *and* the human that approved,
  // because both are true and a reader needs to know which is which.
  //
  // The string itself is deliberately not built here. `resolveProvenance()`
  // in lib/repositories/rules.ts is the one definition of how provenance
  // renders, and restating it would let this row drift from every other row
  // in the same timeline. `who` remains overridable if that ever has to
  // change for approvals alone.
  await logTouchpoint({
    dealId: approval.dealId,
    channel: touchpointChannel(approval.channel),
    body,
    agentId,
    actorUserId: input.actorUserId,
  });

  // The AI DRAFTED chip clears on the board the moment this lands.
  const deal = await setAiPending({
    dealId: approval.dealId,
    value: false,
    actorUserId: input.actorUserId,
  });

  const next = nextActionFor(approval, now);
  const withNext = await setNextAction({
    dealId: approval.dealId,
    label: next.label,
    due: formatDue(next.dueAt),
    state: "ok",
    dueAt: next.dueAt,
    actorUserId: input.actorUserId,
  });

  await appendAudit({
    entity: "approval",
    entityId: approval.id,
    action: edited ? "approval.edited_and_sent" : "approval.approved",
    userId: input.actorUserId,
    before: { status: approval.status, body: approval.body },
    after: { status: "sent", body, agentId, edited },
  });

  return {
    approval: updated,
    deal: withNext ?? deal,
    toast: APPROVAL_TOASTS.approve(withNext.name),
  };
}

async function skip(
  approval: Approval,
  actorUserId: string,
  now: Date,
): Promise<DecideResult> {
  const updated = await writeStatus({
    approvalId: approval.id,
    status: "skipped",
    decidedBy: actorUserId,
    decidedAt: now,
  });

  const deal = await setAiPending({
    dealId: approval.dealId,
    value: false,
    actorUserId,
  });

  await appendAudit({
    entity: "approval",
    entityId: approval.id,
    action: "approval.skipped",
    userId: actorUserId,
    before: { status: approval.status },
    after: { status: "skipped" },
  });

  // Persisted, not merely promised: the runner reads this back before firing.
  const record: SuppressionRecord = {
    triggerType: approval.triggerType,
    approvalId: approval.id,
    suppressedUntil: suppressionUntil(now).toISOString(),
  };
  await appendAudit({
    entity: "deal",
    entityId: approval.dealId,
    action: SUPPRESSION_ACTION,
    userId: actorUserId,
    before: null,
    after: record,
  });

  return { approval: updated, deal, toast: APPROVAL_TOASTS.skip() };
}

/* -------------------------------------------------------------------------
   Row access
   ------------------------------------------------------------------------- */

/**
 * `Approval` (the domain type) has no `agentId` — it is storage-level
 * provenance, not something the card renders — so it comes back alongside
 * rather than inside.
 */
async function loadApproval(
  approvalId: string,
): Promise<{ approval: Approval; agentId: AgentId }> {
  const [row] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1);
  if (!row) throw new Error(`Approval ${approvalId} not found.`);
  return { approval: toApproval(row), agentId: asAgentId(row.agentId) };
}

function asAgentId(value: string | null): AgentId {
  return value === "agent-prospecting" ? "agent-prospecting" : "agent-remarketing";
}

async function writeStatus(input: {
  approvalId: string;
  status: ApprovalStatus;
  body?: string;
  decidedBy: string;
  decidedAt: Date;
}): Promise<Approval> {
  const [row] = await db
    .update(approvals)
    .set({
      status: input.status,
      ...(input.body === undefined ? {} : { body: input.body }),
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    })
    .where(eq(approvals.id, input.approvalId))
    .returning();
  return toApproval(row);
}

/**
 * The stored channel is a display string ("SMS · she prefers text"); the
 * touchpoint wants the bare channel.
 */
export function touchpointChannel(channel: string): TouchpointChannel {
  const head = channel.split("·")[0].trim().toUpperCase();
  return head === "SMS" || head === "EMAIL" || head === "CALL" || head === "VISIT"
    ? head
    : "NOTE";
}

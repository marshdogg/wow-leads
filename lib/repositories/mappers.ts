/**
 * Row → domain-type mapping. Every consumer of a deal, contact, account or
 * touchpoint goes through here so they all see the same object shape.
 */

import type { InferSelectModel } from "drizzle-orm";
import type {
  accessNotes,
  accounts,
  approvals,
  contacts,
  deals,
  touchpoints,
} from "@/db/schema";
import type {
  Account,
  Approval,
  ApprovalStatus,
  Contact,
  ContactChannel,
  Deal,
  DealAction,
  LeadSource,
  NextActionState,
  PipelineId,
  ResultOutcome,
  StageId,
  Touchpoint,
  TouchpointChannel,
  TrackId,
  TriggerType,
} from "@/lib/types";

export type DealRow = InferSelectModel<typeof deals>;
export type AccountRow = InferSelectModel<typeof accounts>;
export type ContactRow = InferSelectModel<typeof contacts>;
export type TouchpointRow = InferSelectModel<typeof touchpoints>;
export type ApprovalRow = InferSelectModel<typeof approvals>;
export type AccessNoteRow = InferSelectModel<typeof accessNotes>;

export function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    pipe: row.pipelineId as PipelineId,
    track: (row.track as TrackId | null) ?? null,
    stage: row.stageId as StageId,
    name: row.name,
    account: row.accountLine,
    tags: row.tags,
    source: row.source as LeadSource,
    owner: {
      initials: row.ownerInitials,
      name: row.ownerName,
      agent: row.ownerIsAgent,
    },
    assignedBy: row.assignedBy,
    aiPending: row.aiPending,
    stale: row.stale,
    staleWarn: row.staleWarn,
    metrics: row.metrics,
    seq: row.seq,
    seqName: row.seqName,
    seqStep: row.seqStep,
    next: row.nextLabel
      ? {
          label: row.nextLabel,
          due: row.nextDue ?? "",
          state: (row.nextState as NextActionState | null) ?? "ok",
        }
      : null,
    act: row.act as DealAction,
    quick: row.quick,
    osRef: row.osRef,
    initialType: row.initialType,
    resultOutcome: (row.resultOutcome as ResultOutcome | null) ?? null,
    retryAt: row.retryAt,
    accountId: row.accountId,
  };
}

export function toAccount(row: AccountRow, accessNotesBody: string): Account {
  return {
    id: row.id,
    name: row.name,
    tags: row.tags,
    details: row.details,
    accessNotes: accessNotesBody,
  };
}

export function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    accountId: row.accountId,
    initials: row.initials,
    name: row.name,
    role: row.role,
    prefers: row.prefers as ContactChannel,
    contact: row.contact,
    notes: row.notes,
    primary: row.isPrimary,
  };
}

export function toTouchpoint(row: TouchpointRow): Touchpoint {
  return {
    id: row.id,
    dealId: row.dealId,
    accountId: row.accountId,
    channel: row.channel as TouchpointChannel,
    body: row.body,
    who: row.who,
    byAgent: row.byAgent,
    initials: row.initials,
    occurredAt: row.occurredAt,
  };
}

export function toApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    dealId: row.dealId,
    triggerType: row.triggerType as TriggerType,
    title: row.title,
    subtitle: row.subtitle,
    chip: row.chip,
    channel: row.channel,
    recipient: row.recipient,
    body: row.body,
    reasons: row.reasons,
    footnote: row.footnote,
    status: row.status as ApprovalStatus,
    createdAt: row.createdAt,
  };
}

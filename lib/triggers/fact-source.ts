import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accessNotes,
  accounts,
  approvals,
  contacts,
  deals,
  promos,
  sequenceSteps,
  sequences,
  touchpoints,
} from "@/db/schema";
import { isCustomerContactChannel } from "@/lib/repositories/rules";
import type { ContactChannel, TriggerType } from "@/lib/types";
import { monthName } from "./dates";
import {
  dayInSequence,
  isAbsent,
  jobScopeAreas,
  parseInitialType,
  parseMonthDay,
  parseMonthYear,
  parseRelativeStale,
  pronounFrom,
  replyNoteFrom,
  shortAccountName,
  splitAreas,
} from "./record-parse";
import { lowerFirst, unpunctuated } from "./text";
import type {
  ContactFacts,
  ElevenMonthFacts,
  ReplyFacts,
  RevivalFacts,
  ScopeFacts,
  SeasonalFacts,
  SequenceFacts,
  SequenceReference,
} from "./types";

/**
 * Turning rows into facts.
 *
 * The predicates are pure and know nothing about the database; this is the
 * layer that reads a deal, its account, its contacts, its touchpoints, its
 * promo and its sequence, and assembles the plain fact object they consume.
 *
 * Two rules govern everything here:
 *
 * 1. **Prefer a real timestamp to a display string.** `touchpoints.occurredAt`
 *    beats `deals.metrics`, which beats parsing `deals.stale`. The prototype
 *    fixtures carry some facts only as human strings ("11 mo since job"), so
 *    the string parsers exist — but they are the last resort, and every one
 *    of them is total.
 *
 * 2. **A fact that is not on the record is `null`, never a guess.** A missing
 *    scope area drops a sentence from the draft. A missing pronoun makes the
 *    copy neutral. Nothing downstream invents the gap back in.
 */

/** The deal row shape the fact builders read. Exported for the runner. */
export type DealRow = typeof deals.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;
type TouchpointRow = typeof touchpoints.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;
type PromoRow = typeof promos.$inferSelect;
type SequenceRow = typeof sequences.$inferSelect;
type SequenceStepRow = typeof sequenceSteps.$inferSelect;
type ApprovalRow = typeof approvals.$inferSelect;

export interface FactContext {
  now: Date;
  deals: DealRow[];
  accountsById: Map<string, AccountRow>;
  accessNotesByAccount: Map<string, string>;
  contactsByAccount: Map<string, ContactRow[]>;
  touchpointsByDeal: Map<string, TouchpointRow[]>;
  promosById: Map<string, PromoRow>;
  sequencesById: Map<string, SequenceRow>;
  stepsBySequence: Map<string, SequenceStepRow[]>;
  approvalsByDeal: Map<string, ApprovalRow[]>;
}

export async function loadFactContext(now: Date): Promise<FactContext> {
  const dealRows = await db.select().from(deals);
  const dealIds = dealRows.map((d) => d.id);
  const accountIds = [
    ...new Set(dealRows.map((d) => d.accountId).filter((id): id is string => !!id)),
  ];
  const promoIds = [
    ...new Set(dealRows.map((d) => d.promoId).filter((id): id is string => !!id)),
  ];
  const sequenceIds = [
    ...new Set(dealRows.map((d) => d.sequenceId).filter((id): id is string => !!id)),
  ];

  const [
    accountRows,
    accessRows,
    contactRows,
    touchpointRows,
    promoRows,
    sequenceRows,
    stepRows,
    approvalRows,
  ] = await Promise.all([
    accountIds.length
      ? db.select().from(accounts).where(inArray(accounts.id, accountIds))
      : [],
    accountIds.length
      ? db.select().from(accessNotes).where(inArray(accessNotes.accountId, accountIds))
      : [],
    accountIds.length
      ? db.select().from(contacts).where(inArray(contacts.accountId, accountIds))
      : [],
    dealIds.length
      ? db
          .select()
          .from(touchpoints)
          .where(inArray(touchpoints.dealId, dealIds))
          .orderBy(asc(touchpoints.occurredAt))
      : [],
    promoIds.length ? db.select().from(promos).where(inArray(promos.id, promoIds)) : [],
    sequenceIds.length
      ? db.select().from(sequences).where(inArray(sequences.id, sequenceIds))
      : [],
    sequenceIds.length
      ? db
          .select()
          .from(sequenceSteps)
          .where(inArray(sequenceSteps.sequenceId, sequenceIds))
          .orderBy(asc(sequenceSteps.stepNumber))
      : [],
    dealIds.length
      ? db.select().from(approvals).where(inArray(approvals.dealId, dealIds))
      : [],
  ]);

  return {
    now,
    deals: dealRows,
    accountsById: byId(accountRows, (r) => r.id),
    accessNotesByAccount: new Map(accessRows.map((r) => [r.accountId, r.body])),
    contactsByAccount: groupBy(contactRows, (r) => r.accountId),
    touchpointsByDeal: groupBy(touchpointRows, (r) => r.dealId),
    promosById: byId(promoRows, (r) => r.id),
    sequencesById: byId(sequenceRows, (r) => r.id),
    stepsBySequence: groupBy(stepRows, (r) => r.sequenceId),
    approvalsByDeal: groupBy(approvalRows, (r) => r.dealId),
  };
}

/* -------------------------------------------------------------------------
   Shared derivations
   ------------------------------------------------------------------------- */

const WORK_TYPE_TAGS = ["INTERIOR", "EXTERIOR", "INDUSTRIAL"];

const BEST_FIT_TAGS = [
  "GENERAL CONTRACTOR",
  "PROPERTY MANAGER",
  "FACILITY MANAGER",
  "HOA BOARD",
];

/** How a rep would refer to an account type mid-sentence. */
const RELATION_WORDS: Record<string, string> = {
  "GENERAL CONTRACTOR": "GC",
  "PROPERTY MANAGER": "property manager",
  "FACILITY MANAGER": "facility manager",
  "HOA BOARD": "HOA",
  "INDUSTRY PARTNER": "partner",
};

export function contactFacts(ctx: FactContext, deal: DealRow): ContactFacts {
  const list = deal.accountId ? (ctx.contactsByAccount.get(deal.accountId) ?? []) : [];
  const contact = list.find((c) => c.isPrimary) ?? list[0];

  const name = contact?.name ?? deal.name;
  return {
    name,
    firstName: firstNameOf(name),
    prefers: normaliseChannel(contact?.prefers),
    address: contact?.contact ?? "",
    pronoun: pronounFrom(contact?.notes ?? ""),
  };
}

function firstNameOf(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function normaliseChannel(value: string | undefined): ContactChannel {
  const upper = (value ?? "").toUpperCase();
  return upper === "SMS" || upper === "PHONE" ? upper : "EMAIL";
}

function replyFacts(ctx: FactContext, deal: DealRow): ReplyFacts {
  const list = deal.accountId ? (ctx.contactsByAccount.get(deal.accountId) ?? []) : [];
  const contact = list.find((c) => c.isPrimary) ?? list[0];
  return { count: 0, medianMinutes: null, note: replyNoteFrom(contact?.notes ?? "") };
}

function dealTouchpoints(ctx: FactContext, deal: DealRow): TouchpointRow[] {
  return ctx.touchpointsByDeal.get(deal.id) ?? [];
}

/**
 * The last time a **person** reached the customer.
 *
 * Agent-authored touchpoints are excluded on purpose. The gate these feed is
 * "don't talk over a rep who is already working this account", and an agent's
 * own approved send is not a rep working the account — counting it would let
 * a trigger's own output permanently suppress the trigger that produced it.
 * (r1's hero timeline is exactly this shape: an approved AI send at 9:14 this
 * morning sitting on top of an 11-month-old job.)
 *
 * Note this is deliberately not `deals.lastTouchAt`, and deliberately
 * narrower: that field counts `NOTE` as contact, this does not. Same word,
 * two questions. "Is this deal being ignored?" — a rep who wrote a note
 * engaged with the account, so a manager alert must not nag them. "Would
 * sending this talk over a rep?" — a note can be written without anyone
 * being spoken to, so it must not block a send. r1's September-2025
 * completion follow-up is the case that separates them: a NOTE that was
 * plainly a conversation, which should reset the neglect clock but should
 * not count as a warranty-window contact. Don't align the two.
 */
function lastHumanContactAt(ctx: FactContext, deal: DealRow): Date | null {
  const human = dealTouchpoints(ctx, deal).filter(
    (t) => isCustomerContactChannel(t.channel.toUpperCase()) && !t.byAgent,
  );
  return human.length ? human[human.length - 1].occurredAt : null;
}

export function metricValue(deal: DealRow, label: string): string | null {
  const hit = deal.metrics.find(
    (m) => m.label.toUpperCase() === label.toUpperCase(),
  );
  return hit?.value ?? null;
}

function workTypeOf(deal: DealRow): string {
  const tag = deal.tags.find((t) => WORK_TYPE_TAGS.includes(t.toUpperCase()));
  return tag ? tag.toLowerCase() : "painting";
}

function scopeFacts(
  ctx: FactContext,
  deal: DealRow,
  job?: TouchpointRow,
): ScopeFacts {
  const workType = workTypeOf(deal);
  // What this job actually covered beats what the account generally is.
  const areas = jobScopeAreas(job);
  return {
    summary: `${workType.charAt(0).toUpperCase()}${workType.slice(1)} repaint`,
    workType,
    areas: areas.length > 0 ? areas : scopeAreas(ctx, deal),
    value: metricValue(deal, "LAST JOB") ?? metricValue(deal, "ORIGINAL"),
  };
}

/**
 * Rooms named on the account record. The fixture data carries these as an
 * account detail rather than a column, so this reads whichever detail is
 * about scope and splits it into areas. No detail → no areas → the draft
 * simply does not mention rooms.
 */
export function scopeAreas(ctx: FactContext, deal: DealRow): string[] {
  if (!deal.accountId) return [];
  const account = ctx.accountsById.get(deal.accountId);
  const detail = account?.details.find((d) =>
    /\b(scope|rooms?|areas?)\b/i.test(d.label),
  );
  return splitAreas(detail?.value);
}

/* -------------------------------------------------------------------------
   11-month warranty
   ------------------------------------------------------------------------- */

export function elevenMonthFacts(
  ctx: FactContext,
  deal: DealRow,
): ElevenMonthFacts | null {
  if (deal.pipelineId !== "resi") return null;

  const events = dealTouchpoints(ctx, deal);
  const jobEvent = [...events]
    .reverse()
    .find((t) => t.channel.toUpperCase() === "JOB");
  const jobCompletedAt =
    jobEvent?.occurredAt ??
    parseMonthYear(metricValue(deal, "COMPLETED")) ??
    (deal.stale.includes("since job")
      ? parseRelativeStale(deal.stale, ctx.now)
      : null);

  if (!jobCompletedAt) return null;

  // The first time a person spoke to them after the job closed out. The seed
  // records this as a NOTE rather than a call, so any non-agent touchpoint
  // after completion counts.
  const followUp =
    events.find(
      (t) => !t.byAgent && t.occurredAt.getTime() > jobCompletedAt.getTime(),
    )?.occurredAt ?? null;

  return {
    kind: "eleven_month",
    dealId: deal.id,
    dealName: deal.name,
    contact: contactFacts(ctx, deal),
    jobCompletedAt,
    completionFollowUpAt: followUp,
    lastContactAt: lastHumanContactAt(ctx, deal),
    scope: scopeFacts(ctx, deal, jobEvent),
    replies: replyFacts(ctx, deal),
    now: ctx.now,
  };
}

/* -------------------------------------------------------------------------
   Seasonal promo
   ------------------------------------------------------------------------- */

export function seasonalFacts(ctx: FactContext, deal: DealRow): SeasonalFacts | null {
  if (deal.pipelineId !== "resi") return null;

  const promo = deal.promoId ? ctx.promosById.get(deal.promoId) : undefined;
  const offerMetric = metricValue(deal, "OFFER");
  if (!promo && !offerMetric) return null;

  const workType = workTypeOf(deal);
  const promoLabel = promo?.label ?? `${offerMetric} ${workType}`;
  const promoExpiresAt =
    promo?.windowEnd ?? parseMonthDay(metricValue(deal, "EXPIRES"), ctx.now);

  const events = dealTouchpoints(ctx, deal);

  // The send we are chasing, specifically — not merely the newest outbound
  // message. The seed tags it with a PROMO field; failing that, look for the
  // code or label in the body before falling back to the card string.
  const promoSend = [...events]
    .reverse()
    .find(
      (t) =>
        t.structured?.some((f) => /\bpromo\b|\boffer\b/i.test(f.label)) ||
        (promo?.code ? t.body.includes(promo.code) : false) ||
        (offerMetric ? t.body.includes(offerMetric) : false),
    );
  const promoSentAt =
    promoSend?.occurredAt ??
    (deal.stale.includes("promo sent")
      ? parseRelativeStale(deal.stale, ctx.now)
      : null);

  const replied = promoSentAt
    ? events.some(
        (t) =>
          t.occurredAt.getTime() > promoSentAt.getTime() &&
          /\breplied?\b|\bresponded\b/i.test(t.body),
      )
    : false;

  const jobCompletedAt = parseMonthYear(metricValue(deal, "COMPLETED"));

  return {
    kind: "seasonal",
    dealId: deal.id,
    dealName: deal.name,
    contact: contactFacts(ctx, deal),
    promoLabel,
    promoShortLabel: shortPromoLabel(promoLabel),
    promoSentAt,
    promoExpiresAt,
    promoStartsAt: promo?.windowStart ?? null,
    promoActive: promo?.active ?? true,
    replied,
    opened: false,
    priorJobNotes: priorJobNotes(ctx, deal, workType),
    scopeAreas: scopeAreas(ctx, deal),
    priorJobPhrase: priorJobPhrase(jobCompletedAt, ctx.now),
    chasesSent: sentApprovalCount(ctx, deal.id, "seasonal"),
    parkRetryLabel: metricValue(deal, "RETRY")?.toLowerCase() ?? deal.retryAt,
    now: ctx.now,
  };
}

/** "15% spring interior" → "spring interior" — the discount is not the subject. */
function shortPromoLabel(label: string): string {
  return label.replace(/^\s*\S*\d+%?\s*(off\s*)?/i, "").trim() || label;
}

function priorJobPhrase(jobCompletedAt: Date | null, now: Date): string | null {
  if (!jobCompletedAt) return null;
  if (jobCompletedAt.getFullYear() < now.getFullYear()) return "last year";
  return `back in ${monthName(jobCompletedAt)}`;
}

/**
 * Things about the previous job worth naming: what kind of work it was, plus
 * any recorded preference (low-VOC, finish, colour) a rep noted on the site.
 */
function priorJobNotes(ctx: FactContext, deal: DealRow, workType: string): string[] {
  const notes = [workType];
  if (deal.accountId) {
    const account = ctx.accountsById.get(deal.accountId);
    for (const detail of account?.details ?? []) {
      if (!/\b(preference|paint|finish|colou?r|voc)\b/i.test(detail.label)) continue;
      if (isAbsent(detail.value)) continue;
      const value = lowerFirst(unpunctuated(detail.value));
      // The record sometimes already says "on file"; don't say it twice.
      notes.push(/\bon file$/i.test(value) ? value : `${value} on file`);
    }
  }
  return notes;
}

function sentApprovalCount(
  ctx: FactContext,
  dealId: string,
  triggerType: TriggerType,
): number {
  return (ctx.approvalsByDeal.get(dealId) ?? []).filter(
    (a) => a.triggerType === triggerType && a.status === "sent",
  ).length;
}

/* -------------------------------------------------------------------------
   Revival
   ------------------------------------------------------------------------- */

export function revivalFacts(ctx: FactContext, deal: DealRow): RevivalFacts | null {
  if (deal.pipelineId !== "resi") return null;

  const lostReason = metricValue(deal, "LOST FOR") ?? metricValue(deal, "RESULT");
  if (!lostReason && deal.track !== "revival") return null;

  const events = dealTouchpoints(ctx, deal);
  const lossEvent = [...events]
    .reverse()
    .find((t) => /\blost\b|\bdeclined\b|\bwent with\b/i.test(t.body));
  const lostAt =
    lossEvent?.occurredAt ??
    (deal.stale.includes("lost") ? parseRelativeStale(deal.stale, ctx.now) : null);

  const workType = workTypeOf(deal);

  return {
    kind: "revival",
    dealId: deal.id,
    dealName: deal.name,
    contact: contactFacts(ctx, deal),
    lostAt,
    lostReason,
    originalValue: metricValue(deal, "ORIGINAL"),
    originalScope: `${workType} repaint`,
    lastContactAt: lastHumanContactAt(ctx, deal),
    now: ctx.now,
  };
}

/* -------------------------------------------------------------------------
   Sequence step
   ------------------------------------------------------------------------- */

export function sequenceFacts(ctx: FactContext, deal: DealRow): SequenceFacts | null {
  if (deal.pipelineId !== "bizdev") return null;

  const steps = deal.sequenceId ? (ctx.stepsBySequence.get(deal.sequenceId) ?? []) : [];
  if (steps.length === 0) return null;

  const sequence = deal.sequenceId ? ctx.sequencesById.get(deal.sequenceId) : undefined;
  const stepNumber = deal.seq ?? 1;
  const step = steps.find((s) => s.stepNumber === stepNumber);
  if (!step) return null;

  const events = dealTouchpoints(ctx, deal);
  const sequenceStartedAt =
    events[0]?.occurredAt ?? parseInitialType(deal.initialType, ctx.now) ?? deal.createdAt;
  const previousStepAt =
    stepNumber > 1 ? (events[events.length - 1]?.occurredAt ?? null) : null;

  const workType = workTypeOf(deal);
  const accountName = deal.accountLine || deal.name;

  return {
    kind: "sequence",
    dealId: deal.id,
    dealName: deal.name,
    contact: contactFacts(ctx, deal),
    sequenceName: sequence?.name ?? deal.seqName ?? "sequence",
    stepNumber,
    totalSteps: sequence?.stepCount ?? steps.length,
    stepLabel: step.label,
    stepChannel: normaliseChannel(step.channel),
    delayDays: step.delayDays,
    dayInSequence: dayInSequence(steps, stepNumber),
    upcomingStepLabels: steps
      .filter((s) => s.stepNumber > stepNumber)
      .map((s) => s.label),
    previousStepAt,
    sequenceStartedAt,
    completed: deal.seqStep?.toLowerCase() === "complete",
    accountTags: deal.tags,
    bestFitTags: BEST_FIT_TAGS,
    accountName,
    accountShortName: shortAccountName(accountName),
    workType,
    projectHint: null,
    reference: findReference(ctx, deal),
    now: ctx.now,
  };
}

/**
 * A named account we can point at as proof. It has to be a real, active
 * account of the same type as the prospect — that is what makes it a usable
 * reference rather than a boast.
 */
function findReference(ctx: FactContext, deal: DealRow): SequenceReference | null {
  const sharedTag = deal.tags.find((tag) => BEST_FIT_TAGS.includes(tag.toUpperCase()));
  if (!sharedTag) return null;

  const candidate = ctx.deals.find(
    (other) =>
      other.id !== deal.id &&
      other.pipelineId === "comm" &&
      other.tags.includes(sharedTag) &&
      Boolean(other.accountLine),
  );
  if (!candidate) return null;

  const name = candidate.accountLine;
  return {
    name,
    relation: RELATION_WORDS[sharedTag.toUpperCase()] ?? sharedTag.toLowerCase(),
    proof: `${name} sites`,
  };
}

/* -------------------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------------------- */

function byId<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export * from "./record-parse";

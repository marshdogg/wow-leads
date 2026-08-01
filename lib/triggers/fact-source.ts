import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accessNotes,
  accounts,
  approvals,
  contacts,
  deals,
  jobs,
  canvassTargets,
  promos,
  sequenceSteps,
  sequences,
  touchpoints,
} from "@/db/schema";
import { isCustomerContactChannel } from "@/lib/repositories/rules";
import { enquiryChannelFor } from "./never-quoted";
import { isPaidSource } from "./speed-to-lead";
import type { ContactChannel, TriggerType } from "@/lib/types";
import { daysBetween, monthName } from "./dates";
import {
  dayInSequence,
  isAbsent,
  completionEvent,
  jobScopeAreas,
  jobWorkType,
  proximityFrom,
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
  NeighbourCampaignFacts,
  NeverQuotedFacts,
  SeasonalFacts,
  SequenceFacts,
  SequenceReference,
  SpeedToLeadFacts,
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
type CanvassTargetRow = typeof canvassTargets.$inferSelect;
type JobRow = typeof jobs.$inferSelect;

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
  /** Addresses to canvass, keyed by the job whose crew the neighbours can see. */
  canvassByDeal: Map<string, CanvassTargetRow[]>;
  /**
   * Completed jobs by account, newest first.
   *
   * `jobs` is the source of job **facts**; the JOB touchpoint is the source of
   * job **narrative**. They answer different questions — the row carries the
   * timestamp, work type and areas that copy and campaigns are computed from,
   * the touchpoint renders on the Record timeline. The touchpoint is not for
   * parsing, and the prose fallback below is temporary.
   */
  jobsByAccount: Map<string, JobRow[]>;
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
    canvassRows,
    jobRows,
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
    dealIds.length
      ? db
          .select()
          .from(canvassTargets)
          .where(inArray(canvassTargets.sourceDealId, dealIds))
      : [],
    accountIds.length
      ? db
          .select()
          .from(jobs)
          .where(inArray(jobs.accountId, accountIds))
          .orderBy(asc(jobs.completedAt))
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
    canvassByDeal: groupBy(canvassRows, (r) => r.sourceDealId),
    jobsByAccount: groupBy(jobRows, (r) => r.accountId),
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
  jobEvent?: TouchpointRow,
  job?: JobRow,
): ScopeFacts {
  // Columns first, then the completion prose, then the card's tag. The tag is
  // last because it describes the *account* — r8 is tagged INTERIOR while its
  // job was an exterior repaint, and trusting the tag told the neighbours we
  // had painted the inside of a house whose outside they watched us paint.
  const workType = job?.workType ?? jobWorkType(jobEvent) ?? workTypeOf(deal);
  const areas =
    job?.areas && job.areas.length > 0 ? job.areas : jobScopeAreas(jobEvent);
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

/**
 * The most recent completed job, from `jobs` where it exists.
 *
 * The JOB-touchpoint path behind it is a migration fallback and goes when the
 * last account is backfilled — along with `completionEvent` and
 * `isCompletionRecord`, whose prose heuristic only ever existed because
 * `bookDeal` writes estimate bookings on the same channel. A regex kept as a
 * second opinion behind an authoritative column is a liability, not a net.
 */
function latestJob(ctx: FactContext, deal: DealRow): JobRow | undefined {
  const rows = deal.accountId ? (ctx.jobsByAccount.get(deal.accountId) ?? []) : [];
  return rows.length ? rows[rows.length - 1] : undefined;
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
  const job = latestJob(ctx, deal);
  const jobEvent = completionEvent(events);
  const jobCompletedAt =
    job?.completedAt ??
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
    scope: scopeFacts(ctx, deal, jobEvent, job),
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

/* -------------------------------------------------------------------------
   Speed to lead
   ------------------------------------------------------------------------- */

export function speedToLeadFacts(
  ctx: FactContext,
  deal: DealRow,
): SpeedToLeadFacts | null {
  if (deal.pipelineId !== "newleads") return null;

  const events = dealTouchpoints(ctx, deal);
  // The lead's arrival: the SOURCE row that records it landing, else the row
  // creation time. Both are real timestamps — this clock is never parsed out
  // of a display string, because minutes matter here.
  const sourceEvent = events.find((t) => t.channel.toUpperCase() === "SOURCE");
  const arrivedAt = sourceEvent?.occurredAt ?? deal.createdAt;

  return {
    kind: "speed_to_lead",
    dealId: deal.id,
    dealName: deal.name,
    contact: contactFacts(ctx, deal),
    arrivedAt,
    firstContactAt: firstHumanContactAt(ctx, deal),
    lastAttemptAt: lastHumanContactAt(ctx, deal),
    stageId: deal.stageId,
    source: deal.source,
    paid: isPaidSource(deal.source),
    ownerName: deal.ownerName,
    ownerUserId: deal.ownerUserId,
    now: ctx.now,
  };
}

/** The first time a person tried to reach them, agents excluded. */
function firstHumanContactAt(ctx: FactContext, deal: DealRow): Date | null {
  const human = dealTouchpoints(ctx, deal).filter(
    (t) => isCustomerContactChannel(t.channel.toUpperCase()) && !t.byAgent,
  );
  return human.length ? human[0].occurredAt : null;
}

/* -------------------------------------------------------------------------
   Neighbour campaign
   ------------------------------------------------------------------------- */

/**
 * One fact object per unworked address on the completed job's canvass list.
 *
 * The addresses are data, never derived. Generating neighbouring street
 * numbers arithmetically would fabricate addresses for messages that go to
 * real houses, so the source is the `canvass_targets` table and a job with no
 * rows there simply does not fire.
 */
export function neighbourCampaignFacts(
  ctx: FactContext,
  deal: DealRow,
): NeighbourCampaignFacts[] {
  const targets = (ctx.canvassByDeal.get(deal.id) ?? []).filter(
    // `created` already became a lead, `skipped` was declined by a human.
    // Either way the decision has been made and re-drafting would undo it.
    (t) => t.status === "pending" || t.status === "drafted",
  );
  if (targets.length === 0) return [];

  const events = dealTouchpoints(ctx, deal);
  const job = latestJob(ctx, deal);
  const jobEvent = completionEvent(events);
  if (!job && !jobEvent) return [];

  const jobAddress = deal.accountLine;
  if (!jobAddress) return [];

  const account = deal.accountId ? ctx.accountsById.get(deal.accountId) : undefined;
  const details = account?.details ?? [];
  const known = knownAddresses(ctx);
  const contact = contactFacts(ctx, deal);
  const scope = scopeFacts(ctx, deal, jobEvent, job);
  const crew = job?.crew ?? crewName(details);
  const onSiteUntil = crewOnSiteUntil(details, ctx.now);

  return targets.map((target) => ({
    kind: "neighbour_campaign" as const,
    dealId: deal.id,
    dealName: deal.name,
    // A canvassed address has no contact on file; the copy opens unaddressed
    // rather than borrowing the neighbour's name.
    contact: { ...contact, name: "", firstName: "", address: target.address },
    jobAddress,
    jobCompletedAt: job?.completedAt ?? jobEvent!.occurredAt,
    scope,
    crewName: crew,
    crewOnSiteUntil: onSiteUntil,
    neighbourAddress: target.address,
    canvassTargetId: target.id,
    proximity: proximityFrom(target.notes),
    alreadyKnown:
      Boolean(target.dealId) || known.has(normaliseAddress(target.address)),
    now: ctx.now,
  }));
}

function crewName(details: { label: string; value: string }[]): string | null {
  const detail = details.find((d) => /\bcrew\b/i.test(d.label));
  if (!detail || isAbsent(detail.value)) return null;
  // "Kris Jolin crew · 1-day interior" → "Kris Jolin crew"
  return detail.value.split("·")[0].trim() || null;
}

function crewOnSiteUntil(
  details: { label: string; value: string }[],
  now: Date,
): Date | null {
  const detail = details.find((d) =>
    /\b(on site until|crew until|through)\b/i.test(d.label),
  );
  if (!detail || isAbsent(detail.value)) return null;
  return parseMonthDay(detail.value, now);
}

/** Every address we already have a deal against, for the dedupe check. */
function knownAddresses(ctx: FactContext): Set<string> {
  return new Set(
    ctx.deals
      .map((d) => normaliseAddress(d.accountLine))
      .filter((line) => line.length > 0),
  );
}

export function normaliseAddress(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "");
}

/* -------------------------------------------------------------------------
   Never quoted
   ------------------------------------------------------------------------- */

export function neverQuotedFacts(
  ctx: FactContext,
  deal: DealRow,
): NeverQuotedFacts | null {
  if (deal.pipelineId !== "resi") return null;

  // The track is the declaration. A quote metric that says anything other
  // than "Never", or a completed job, means this record has better material
  // to work with and a different trigger owns it.
  const quoted = metricValue(deal, "QUOTED");
  const everQuoted = Boolean(quoted) && !/^never$/i.test(quoted!.trim());
  if (deal.track !== "neverquoted" && !isNeverQuotedShape(deal, quoted)) return null;

  const events = dealTouchpoints(ctx, deal);
  if (events.some((t) => t.channel.toUpperCase() === "JOB")) return null;

  // "ENQUIRED" carries a date on some records ("Jun 2025") and a channel on
  // others ("Home show"). Parse it as a date and accept null — the copy is
  // built to work without one.
  const enquired = metricValue(deal, "ENQUIRED");
  const enquiredAt =
    parseMonthYear(enquired) ??
    (deal.stale.includes("enquired") ? parseRelativeStale(deal.stale, ctx.now) : null);

  const lastContact = lastHumanContactAt(ctx, deal);
  const unworkedFrom = lastContact ?? enquiredAt ?? parseRelativeStale(deal.stale, ctx.now);

  return {
    kind: "never_quoted",
    dealId: deal.id,
    dealName: deal.name,
    contact: contactFacts(ctx, deal),
    enquiredAt,
    enquiryChannel: enquiryChannelFor(deal.source),
    sourceLabel: deal.source,
    // On a never-quoted record the work-type tag cannot describe a job,
    // because there isn't one — it can only have come from the enquiry.
    enquiredAbout: workTypeTag(deal),
    unworkedDays: unworkedFrom ? daysBetween(unworkedFrom, ctx.now) : null,
    everQuoted,
    now: ctx.now,
  };
}

/**
 * A record that walks like a never-quoted lead even without the track set:
 * an explicit "Never" quote metric and no job value on file.
 */
function isNeverQuotedShape(deal: DealRow, quoted: string | null): boolean {
  return (
    Boolean(quoted) &&
    /^never$/i.test(quoted!.trim()) &&
    !metricValue(deal, "LAST JOB")
  );
}

/** The work-type tag, or null when the account carries none. */
function workTypeTag(deal: DealRow): string | null {
  const tag = deal.tags.find((t) => WORK_TYPE_TAGS.includes(t.toUpperCase()));
  return tag ? tag.toLowerCase() : null;
}

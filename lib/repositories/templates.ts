/**
 * Message templates — the copy the franchise owns.
 *
 * Reads are unfiltered on purpose: `resolveTemplate` in `lib/templates/resolve.ts`
 * does the selecting, and it needs to see inactive and non-matching rows to
 * make the same decision the Templates screen previews. Filtering here would
 * split that logic across a query and a pure function.
 */

import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  canvassTargets,
  contacts,
  deals,
  promos,
  jobs,
  templates,
  touchpoints,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import {
  completionPhrase,
  monthDay,
  monthName,
  nextWeekdaySlot,
  recentSendPhrase,
  seasonName,
  weekdayName,
} from "@/lib/triggers/dates";
import {
  isAbsent,
  parseMonthYear,
  proximityClause,
  proximityFrom,
  shortAccountName,
} from "@/lib/triggers/record-parse";
import { joinList } from "@/lib/triggers/text";
import { appendAudit } from "./audit";
import type {
  MessageTemplate,
  TemplateChannel,
  TemplateFacts,
  TemplateQuery,
} from "@/lib/templates/types";
import type {
  ContactChannel,
  PipelineId,
  StageId,
  TrackId,
  TriggerType,
} from "@/lib/types";

type TemplateRow = typeof templates.$inferSelect;

function toTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as TemplateChannel,
    triggerType: (row.triggerType as TriggerType | null) ?? null,
    pipelineId: (row.pipelineId as PipelineId | null) ?? null,
    stageId: (row.stageId as StageId | null) ?? null,
    track: (row.track as TrackId | null) ?? null,
    subject: row.subject,
    body: row.body,
    active: row.active,
    allowAiAdaptation: row.allowAiAdaptation,
    isDefault: row.isDefault,
    authoredBy: row.authoredBy,
    updatedAt: row.updatedAt,
  };
}

/** Franchise templates first, then the shipped defaults, newest edit first. */
export async function getTemplates(): Promise<MessageTemplate[]> {
  const rows = await db
    .select()
    .from(templates)
    .orderBy(
      asc(templates.isDefault),
      desc(templates.updatedAt),
      asc(templates.id),
    );
  return rows.map(toTemplate);
}

export async function getTemplate(id: string): Promise<MessageTemplate | null> {
  const [row] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, id))
    .limit(1);
  return row ? toTemplate(row) : null;
}

export interface SaveTemplateInput {
  /** Omit to create. */
  id?: string;
  name: string;
  channel: TemplateChannel;
  triggerType?: TriggerType | null;
  /**
   * Open strings, not the seeded unions. Pipelines, stages and tracks are
   * *rows* — a franchise creating its own must be scopeable, and the unions in
   * `lib/types.ts` only ever named the ones we ship. Validated at the action
   * boundary against what the database actually holds, which also catches a
   * stage deleted after the template was written.
   */
  pipelineId?: string | null;
  stageId?: string | null;
  track?: string | null;
  subject?: string | null;
  body: string;
  active?: boolean;
  allowAiAdaptation?: boolean;
  actorUserId: string;
}

/**
 * Creates or updates a franchise template.
 *
 * A shipped default is never mutated here — `duplicateTemplate` forks it
 * first. Attempting to save over one is a caller bug rather than something to
 * silently allow, because the next release would overwrite the edit.
 */
export async function saveTemplate(
  input: SaveTemplateInput,
): Promise<MessageTemplate> {
  const existing = input.id ? await getTemplate(input.id) : null;
  if (existing?.isDefault) {
    throw new Error(
      `Template "${input.id}" is a shipped default. Duplicate it first — editing it directly would be overwritten by the next release.`,
    );
  }

  const id = input.id ?? `tpl-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date();
  const values = {
    id,
    name: input.name,
    channel: input.channel,
    triggerType: input.triggerType ?? null,
    pipelineId: input.pipelineId ?? null,
    stageId: input.stageId ?? null,
    track: input.track ?? null,
    subject: input.subject ?? null,
    body: input.body,
    active: input.active ?? true,
    // Only defaulted for a *new* template. On an update an omitted field must
    // preserve what is stored — see the `set` clause below. Coercing to false
    // here would silently disarm a franchise's opt-in every time anyone saved
    // an unrelated wording change from a screen that doesn't expose it.
    allowAiAdaptation:
      input.allowAiAdaptation ?? existing?.allowAiAdaptation ?? false,
    isDefault: false,
    authoredBy: input.actorUserId,
    updatedAt: now,
  };

  const [row] = await db
    .insert(templates)
    .values(values)
    .onConflictDoUpdate({
      target: templates.id,
      set: {
        name: values.name,
        channel: values.channel,
        triggerType: values.triggerType,
        pipelineId: values.pipelineId,
        stageId: values.stageId,
        track: values.track,
        subject: values.subject,
        body: values.body,
        active: values.active,
        // Absent means "leave it alone", not "turn it off".
        ...(input.allowAiAdaptation === undefined
          ? {}
          : { allowAiAdaptation: input.allowAiAdaptation }),
        authoredBy: values.authoredBy,
        updatedAt: now,
      },
    })
    .returning();

  await appendAudit({
    entity: "template",
    entityId: id,
    action: existing ? "update" : "create",
    userId: input.actorUserId,
    before: existing
      ? {
          name: existing.name,
          body: existing.body,
          active: existing.active,
          allowAiAdaptation: existing.allowAiAdaptation ?? false,
        }
      : null,
    after: {
      name: row.name,
      body: row.body,
      active: row.active,
      allowAiAdaptation: row.allowAiAdaptation,
    },
  });

  return toTemplate(row);
}

export async function setTemplateActive(
  id: string,
  active: boolean,
  actorUserId: string,
): Promise<void> {
  const before = await getTemplate(id);
  if (!before) throw new Error(`Template "${id}" not found.`);

  await db
    .update(templates)
    .set({ active, updatedAt: new Date() })
    .where(eq(templates.id, id));

  await appendAudit({
    entity: "template",
    entityId: id,
    action: active ? "activate" : "deactivate",
    userId: actorUserId,
    before: { active: before.active },
    after: { active },
  });
}

/**
 * Forks a template into one the franchise owns — the path for editing shipped
 * copy. The copy starts inactive so nothing changes the moment it is made;
 * it takes effect when someone turns it on, having read it.
 */
export async function duplicateTemplate(
  id: string,
  actorUserId: string,
): Promise<MessageTemplate> {
  const source = await getTemplate(id);
  if (!source) throw new Error(`Template "${id}" not found.`);

  const newId = `tpl-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date();
  const [row] = await db
    .insert(templates)
    .values({
      id: newId,
      name: `${source.name} (copy)`,
      channel: source.channel,
      triggerType: source.triggerType,
      pipelineId: source.pipelineId,
      stageId: source.stageId,
      track: source.track,
      subject: source.subject,
      body: source.body,
      active: false,
      allowAiAdaptation: source.allowAiAdaptation ?? false,
      isDefault: false,
      authoredBy: actorUserId,
      updatedAt: now,
    })
    .returning();

  await appendAudit({
    entity: "template",
    entityId: newId,
    action: "duplicate",
    userId: actorUserId,
    before: { sourceId: source.id, isDefault: source.isDefault },
    after: { name: row.name, active: row.active },
  });

  return toTemplate(row);
}

/* -------------------------------------------------------------------------
   Facts
   ------------------------------------------------------------------------- */

/**
 * The bridge between a record and a template.
 *
 * `resolveTemplate` and `renderTemplate` take a flat token map and nothing
 * builds one — this does. **Bulk on purpose:** the Templates screen previews
 * copy as the author types, so facts are loaded once for the preview set and
 * the pure functions re-render on every keystroke client-side. A per-deal
 * server action would be a round trip per keystroke, which is not a preview.
 *
 * **Every unknown is `null`, never a placeholder.** That null is the whole
 * mechanism: it is what makes `factsSatisfy` reject a template referencing a
 * job for a contact who has none, so the resolver falls through to a plainer
 * sibling instead of rendering a gap. An empty string or an em dash would
 * satisfy the check and put the hole in the message.
 *
 * Derivations reuse the pure parsers in `lib/triggers/record-parse.ts` and
 * `lib/triggers/dates.ts` rather than re-deriving, so a rendered template says
 * the same thing the drafter would.
 */
export interface TemplatePreviewContext {
  facts: TemplateFacts;
  /**
   * Everything a `TemplateQuery` needs except `triggerType`, which is not a
   * property of a record at all — it comes from the template being edited.
   */
  query: Omit<TemplateQuery, "triggerType">;
}

export async function getTemplatePreviewContextFor(
  dealIds: string[],
  now = new Date(),
): Promise<Record<string, TemplatePreviewContext>> {
  if (!dealIds.length) return {};

  const dealRows = await db
    .select()
    .from(deals)
    .where(inArray(deals.id, dealIds));
  if (!dealRows.length) return {};

  const accountIds = dealRows.map((d) => d.accountId).filter(isPresent);
  const sourceAccountIds = dealRows
    .map((d) => d.sourcedFromDealId)
    .filter(isPresent);
  const sourceJobIds = dealRows
    .map((d) => d.sourcedFromDealId)
    .filter(isPresent);
  const promoIds = dealRows.map((d) => d.promoId).filter(isPresent);
  const allDealIds = dealRows.map((d) => d.id);

  const [
    contactRows,
    accountRows,
    touchpointRows,
    promoRows,
    sourceJobRows,
    canvassRows,
    referenceRows,
    jobRows,
  ] = await Promise.all([
    accountIds.length
      ? db
          .select()
          .from(contacts)
          .where(inArray(contacts.accountId, accountIds))
      : [],
    accountIds.length
      ? db.select().from(accounts).where(inArray(accounts.id, accountIds))
      : [],
    db
      .select()
      .from(touchpoints)
      .where(inArray(touchpoints.dealId, allDealIds))
      .orderBy(desc(touchpoints.occurredAt)),
    promoIds.length
      ? db.select().from(promos).where(inArray(promos.id, promoIds))
      : [],
    sourceJobIds.length
      ? db.select().from(deals).where(inArray(deals.id, sourceJobIds))
      : [],
    db
      .select()
      .from(canvassTargets)
      .where(inArray(canvassTargets.dealId, allDealIds)),
    // A reference we can name in a cold intro: an active commercial account
    // that is not the prospect's own. Named from a row, never invented.
    db
      .select({
        name: deals.name,
        account: deals.accountLine,
        tags: deals.tags,
      })
      .from(deals)
      .where(eq(deals.pipelineId, "comm"))
      .orderBy(asc(deals.id)),
    // The completions table, which is authoritative for job *facts*.
    accountIds.length || sourceAccountIds.length
      ? db.select().from(jobs).orderBy(desc(jobs.completedAt))
      : [],
  ]);

  const byAccount = groupBy(contactRows, (c) => c.accountId);
  const accountById = new Map(accountRows.map((a) => [a.id, a]));
  const touchByDeal = groupBy(touchpointRows, (t) => t.dealId);
  const promoById = new Map(promoRows.map((p) => [p.id, p]));
  const jobById = new Map(sourceJobRows.map((d) => [d.id, d]));
  const canvassByDeal = new Map(
    canvassRows.filter((c) => c.dealId).map((c) => [c.dealId!, c]),
  );
  // Newest completion per account. Rows arrive newest-first, so the first win
  // is the latest.
  const jobByAccount = new Map<string, (typeof jobRows)[number]>();
  for (const j of jobRows) {
    if (!jobByAccount.has(j.accountId)) jobByAccount.set(j.accountId, j);
  }

  const sender = getCurrentUser();
  const out: Record<string, TemplatePreviewContext> = {};

  for (const deal of dealRows) {
    const own = touchByDeal.get(deal.id) ?? [];
    const sourceJob = deal.sourcedFromDealId
      ? jobById.get(deal.sourcedFromDealId)
      : null;

    /*
     * `jobs` is the source of job **facts**; the JOB touchpoint is the source
     * of job **narrative**. Both keep existing and they answer different
     * questions — the touchpoint renders on the Record timeline, the row
     * carries the timestamp, work type and areas that copy and campaigns are
     * computed from. **The touchpoint is not for parsing.**
     *
     * There is deliberately no fallback to the prose any more. A regex hunting
     * "completed" in a sentence was only ever needed because no column could
     * answer the question, and keeping it as a second opinion behind an
     * authoritative one is how two sources of truth get established.
     */
    const jobAccountId = sourceJob?.accountId ?? deal.accountId;
    const job = jobAccountId ? jobByAccount.get(jobAccountId) : undefined;

    const primary =
      (byAccount.get(deal.accountId ?? "") ?? []).find((c) => c.isPrimary) ??
      (byAccount.get(deal.accountId ?? "") ?? [])[0];

    // Strictly off the completion record. Deriving it from the card's tag
    // would make "the {{job.workType}} work we did for you" eligible for a
    // lead who has never had a job — the precise sentence this feature exists
    // to prevent. What the account is tagged as is `account.workType`.
    const workType = job?.workType ?? null;
    const areas = job?.areas ?? [];
    const completedAt = job?.completedAt ?? null;
    const promo = deal.promoId ? promoById.get(deal.promoId) : null;
    const promoSend = own.find((t) => /offer sent|promo/i.test(t.body));
    const loss = own.find((t) => /\blost\b/i.test(t.body));
    const lost =
      Boolean(loss) || presentMetric(deal.metrics, "LOST FOR") !== null;
    const canvass = canvassByDeal.get(deal.id);
    const proximity = canvass ? proximityFrom(canvass.notes) : null;
    const reference = referenceRows.find(
      (r) => r.account && r.account !== deal.accountLine,
    );
    const enquired = metric(deal.metrics, "ENQUIRED");
    const enquiredAt = parseMonthYear(enquired);

    const contactsHere = byAccount.get(deal.accountId ?? "") ?? [];

    out[deal.id] = {
      query: {
        pipelineId: deal.pipelineId as PipelineId,
        stageId: deal.stageId as StageId,
        track: (deal.track as TrackId | null) ?? null,
        // The contact's own preference, not the deal's. Where nobody is on
        // file — a canvassed address, say — this is EMAIL as a *default*, not
        // as a fact about anyone. See the note in the report.
        channel: preferredChannel(primary, contactsHere),
      },
      facts: {
        "contact.firstName": firstName(primary?.name),
        "sender.firstName": firstName(sender.name),
        "sender.company": COMPANY,

        /*
         * The account's tag, deliberately with **no default**. A token that
         * can never be null defeats fact-eligibility — the mechanism that
         * lets a template choose to say less rather than render a gap. An
         * untagged account and an INTERIOR one must be distinguishable, so
         * the generic word ("painting") belongs in template copy as literal
         * text, in a variant the resolver falls through to.
         *
         * Distinct from `job.workType`, and they genuinely disagree: r8 is
         * tagged INTERIOR while its completed job was exterior.
         */
        "account.workType": tagWorkType(deal.tags),

        "job.scope": workType ? `the ${workType} work` : null,
        "job.workType": workType,
        "job.completedMonth": completedAt
          ? completionPhrase(completedAt, now)
          : null,
        "job.areas": areas.length ? joinList(areas) : null,
        "job.address":
          sourceJob?.accountLine ?? (completedAt ? deal.accountLine : null),

        "promo.discount": promo?.discount ?? null,
        "promo.label": promo?.label ?? null,
        "promo.expires": promo?.windowEnd ? monthDay(promo.windowEnd) : null,
        "promo.sentWhen": promoSend
          ? recentSendPhrase(promoSend.occurredAt, now)
          : null,
        "promo.slot": weekdayName(nextWeekdaySlot(now)),

        // Only when something was actually lost. Deriving a scope from the tag
        // would let "we quoted your {{loss.scope}}" go to someone we never
        // quoted.
        "loss.value": lost ? presentMetric(deal.metrics, "ORIGINAL") : null,
        "loss.month": loss ? monthName(loss.occurredAt) : null,
        "loss.scope": lost
          ? `${tagWorkType(deal.tags) ?? "painting"} repaint`
          : null,
        season: seasonName(now),

        // Biz Dev only: the card's name is the person, the account is the firm.
        "prospect.firstName":
          deal.pipelineId === "bizdev" ? firstName(deal.name) : null,
        "prospect.company":
          deal.pipelineId === "bizdev"
            ? shortAccountName(deal.accountLine)
            : null,
        "reference.proof":
          deal.pipelineId === "bizdev" && reference?.account
            ? `${reference.account} sites`
            : null,

        "neighbour.proximity": proximity ? proximityClause(proximity) : null,
        // No stored crew-departure date, so this stays null and the "crew still
        // on site" template is simply never chosen. Guessing a date would put a
        // false promise on a stranger's doorstep.
        "crew.until": crewUntil(accountById.get(deal.accountId ?? "")),

  
        "enquiry.month": enquiredAt ? enquiryWhen(enquiredAt, now) : null,
        "enquiry.channel": enquiryChannel(deal.source, enquired),
      },
    };
  }

  return out;
}

/** Just the facts — what the drafter needs, without the preview's query. */
export async function getTemplateFactsFor(
  dealIds: string[],
  now = new Date(),
): Promise<Record<string, TemplateFacts>> {
  const context = await getTemplatePreviewContextFor(dealIds, now);
  return Object.fromEntries(
    Object.entries(context).map(([id, c]) => [id, c.facts]),
  );
}

const CONTACT_CHANNELS: ContactChannel[] = ["SMS", "EMAIL", "PHONE"];

function isContactChannel(value: string): value is ContactChannel {
  return (CONTACT_CHANNELS as string[]).includes(value);
}

/**
 * The channel this person prefers. Primary contact first, then anyone else on
 * the account, then EMAIL — which is a default rather than a preference, and
 * the only honest option when the type admits no "unknown".
 */
function preferredChannel(
  primary: { prefers: string } | undefined,
  all: { prefers: string }[],
): ContactChannel {
  const candidate =
    primary?.prefers ?? all.find((c) => isContactChannel(c.prefers))?.prefers;
  return candidate && isContactChannel(candidate) ? candidate : "EMAIL";
}

const COMPANY = "WOW 1 DAY PAINTING";

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
}

function firstName(name: string | undefined | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first && first !== "Unassigned" ? first : null;
}

function metric(
  metrics: { label: string; value: string }[],
  label: string,
): string | null {
  return metrics.find((m) => m.label === label)?.value ?? null;
}

/** A metric value, unless the record is explicitly saying it has none. */
function presentMetric(
  metrics: { label: string; value: string }[],
  label: string,
): string | null {
  const value = metric(metrics, label);
  return value && !isAbsent(value) ? value : null;
}

function tagWorkType(tags: string[]): string | null {
  const tag = tags.find((t) =>
    ["INTERIOR", "EXTERIOR", "INDUSTRIAL"].includes(t),
  );
  return tag ? tag.toLowerCase() : null;
}

/** "Kris Jolin crew · 1-day exterior" says who, not until when. */
function crewUntil(
  account: { details: { label: string; value: string }[] } | undefined,
): string | null {
  const crew = account?.details.find((d) => d.label === "CREW")?.value;
  if (!crew) return null;
  const day =
    /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/i.exec(crew)?.[0] ?? null;
  return day;
}

/** "back in June last year" — never a date the record did not capture. */
function enquiryWhen(enquiredAt: Date, now: Date): string {
  const suffix =
    enquiredAt.getFullYear() < now.getFullYear() ? " last year" : "";
  return `back in ${monthName(enquiredAt)}${suffix}`;
}

/**
 * Somewhere we actually met them, in person.
 *
 * Deliberately only events. The copy that uses this reads "We met at
 * {{enquiry.channel}}" — true of a home show, nonsense about a landing page,
 * and "we met at the website" is the kind of sentence that tells a customer no
 * human read their message. Web and ad sources yield null, so the dated
 * template ("You asked about … back in June") is chosen instead, which is both
 * true and what a rep would write.
 */
const ENQUIRY_CHANNELS: Record<string, string> = {
  "Home Show": "the home show",
  "Trade Show": "the trade show",
};

function enquiryChannel(
  source: string,
  enquired: string | null,
): string | null {
  if (enquired && /show|expo|fair/i.test(enquired)) {
    return `the ${enquired.toLowerCase()}`;
  }
  return ENQUIRY_CHANNELS[source] ?? null;
}

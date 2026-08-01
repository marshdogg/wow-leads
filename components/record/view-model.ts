/**
 * Pure derivations for the Account record.
 *
 * Nothing here touches the database or React — the record page hands in
 * `getAccountView()`'s result and gets back display strings and colours.
 * Every label comes from `lib/record-fields.ts`.
 */

import { PIPES } from "@/lib/pipelines";
import {
  CHANNEL_LABELS,
  META_FIELDS,
  RECORD_FIELDS,
  type MetaFieldKey,
} from "@/lib/record-fields";
import type { Account, Contact, Deal, Touchpoint } from "@/lib/types";

/**
 * Structural mirror of `AccountView` from `lib/repositories/accounts.ts`.
 * Declared locally so this module (and every record component) stays
 * decoupled from the repository module — an `AccountView` satisfies it.
 */
export interface RecordView {
  deal: Deal;
  account: Account;
  contacts: Contact[];
  accessNotes: string;
  timeline: Touchpoint[];
}

/* -------------------------------------------------------------------------
   Account header
   ------------------------------------------------------------------------- */

/** Account-level tags win; a deal on an account with no tags of its own falls
 *  back to the deal's, which is how the prototype rendered the chip row. */
export function accountTags(view: RecordView): string[] {
  return view.account.tags.length ? view.account.tags : view.deal.tags;
}

/* -------------------------------------------------------------------------
   Contacts
   ------------------------------------------------------------------------- */

/** Primary first, then stored order. */
export function orderedContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort(
    (a, b) => Number(b.primary) - Number(a.primary),
  );
}

/* -------------------------------------------------------------------------
   Meta strip
   ------------------------------------------------------------------------- */

export interface MetaRow {
  key: MetaFieldKey;
  label: string;
  value: string;
  color: string;
  /** Set when the value navigates somewhere — currently the originating job. */
  href?: string;
  /** Set only for rows the e2e suite addresses directly. */
  testId?: string;
}

/** The job a lead came off, when it came off one. */
export interface OriginJob {
  id: string;
  /** Address line of the job, e.g. "2308 Tunlaw Rd NW". */
  account: string;
}

/**
 * The RECORD panel. `assignedBy` renders green when it contains `→` — that
 * arrow means the lead arrived from a trigger or a partner rather than being
 * self-sourced, and the colour is the only place that provenance shows in the
 * panel.
 */
export function metaRows(view: RecordView, origin?: OriginJob | null): MetaRow[] {
  const { deal } = view;
  const primary =
    view.contacts.find((c) => c.primary) ?? view.contacts[0] ?? null;
  const tags = accountTags(view);

  const values: Record<
    MetaFieldKey,
    { value: string; color: string; href?: string; testId?: string } | null
  > = {
    source: { value: deal.source, color: "#e2e7e2" },
    assignedBy: {
      value: deal.assignedBy,
      color: deal.assignedBy.includes("→") ? "#b6f07a" : "#e2e7e2",
    },
    // Green, like a trigger or partner assignment: a lead that came off a job
    // we were already on is the provenance worth noticing. Omitted entirely
    // when there is no originating job, rather than shown as "—".
    sourcedFrom: origin
      ? {
          value: `${RECORD_FIELDS.sourcedFromValuePrefix} ${origin.account}`,
          color: "#b6f07a",
          href: `/record/${origin.id}`,
          testId: "sourced-from",
        }
      : null,
    owner: { value: deal.owner.name, color: "#e2e7e2" },
    // `title`, not `label`. Labels are now category-scoped for the rail, where
    // "Re-marketing" sits under a RESIDENTIAL LEADS heading. This strip has no
    // such heading, so it needs the standalone name: "Residential
    // Re-marketing", which is also what the prototype showed.
    pipeline: { value: PIPES[deal.pipe].title, color: "#e2e7e2" },
    businessType: { value: tags[0] ?? "—", color: "#e2e7e2" },
    preferredContact: {
      value: primary ? CHANNEL_LABELS[primary.prefers] : "—",
      color: "#e2e7e2",
    },
  };

  const rows: MetaRow[] = [];
  for (const f of META_FIELDS) {
    const v = values[f.key];
    if (!v) continue;
    rows.push({ key: f.key, label: f.label, ...v });
  }
  return rows;
}

/* -------------------------------------------------------------------------
   Next step
   ------------------------------------------------------------------------- */

export interface NextStepStyle {
  /** ON TRACK / OVERDUE / NOT SET */
  state: string;
  stateColor: string;
  label: string;
  due: string;
  labelColor: string;
  panelBorder: string;
  blockBorder: string;
  blockBorderStyle: "solid" | "dashed";
  blockBg: string;
}

/**
 * The prototype hard-codes the green "ON TRACK" block. Derived here instead,
 * so a record whose next action is overdue or unset does not claim otherwise.
 * Colours are the documented next-action tokens used on the board card.
 */
export function nextStepStyle(deal: Deal): NextStepStyle {
  if (!deal.next) {
    return {
      state: RECORD_FIELDS.nextStateUnset,
      stateColor: "#5c655c",
      label: RECORD_FIELDS.nextUnsetLabel,
      due: RECORD_FIELDS.nextUnsetDue,
      labelColor: "#98a298",
      panelBorder: "#23271f",
      blockBorder: "#2a2f28",
      blockBorderStyle: "dashed",
      blockBg: "transparent",
    };
  }
  if (deal.next.state === "overdue") {
    return {
      state: RECORD_FIELDS.nextStateOverdue,
      stateColor: "#e07a68",
      label: deal.next.label,
      due: deal.next.due,
      labelColor: "#f0a294",
      panelBorder: "#5c2620",
      blockBorder: "#5c2620",
      blockBorderStyle: "solid",
      blockBg: "#1e100e",
    };
  }
  return {
    state: RECORD_FIELDS.nextStateOk,
    stateColor: "#7ea85c",
    label: deal.next.label,
    due: deal.next.due,
    labelColor: "#b6f07a",
    panelBorder: "#2f6b1f",
    blockBorder: "#2f6b1f",
    blockBorderStyle: "solid",
    blockBg: "#0f1a0b",
  };
}

/* -------------------------------------------------------------------------
   Timeline timestamps
   ------------------------------------------------------------------------- */

/** "Sept", not "Sep" — the prototype spells September out to four letters. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

const DAY_MS = 86_400_000;

/**
 * Timeline stamps read the way a person would say them: clock time today,
 * "N days ago" for the recent past, an absolute date once it stops being
 * relative. Server-rendered only, so there is no hydration skew.
 */
export function formatWhen(at: Date, now: Date = new Date()): string {
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(at)) / DAY_MS);

  if (days <= 0) return `Today, ${clock(at)}`;
  if (days === 1) return `Yesterday, ${clock(at)}`;
  if (days < 14) return `${days} days ago`;
  if (days < 56) return `${Math.round(days / 7)} weeks ago`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}`;
}

function clock(at: Date): string {
  const h = at.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

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
}

/**
 * The RECORD panel. `assignedBy` renders green when it contains `→` — that
 * arrow means the lead arrived from a trigger or a partner rather than being
 * self-sourced, and the colour is the only place that provenance shows in the
 * panel.
 */
export function metaRows(view: RecordView): MetaRow[] {
  const { deal } = view;
  const primary =
    view.contacts.find((c) => c.primary) ?? view.contacts[0] ?? null;
  const tags = accountTags(view);

  const values: Record<MetaFieldKey, { value: string; color: string }> = {
    source: { value: deal.source, color: "#e2e7e2" },
    assignedBy: {
      value: deal.assignedBy,
      color: deal.assignedBy.includes("→") ? "#b6f07a" : "#e2e7e2",
    },
    owner: { value: deal.owner.name, color: "#e2e7e2" },
    pipeline: { value: PIPES[deal.pipe].label, color: "#e2e7e2" },
    businessType: { value: tags[0] ?? "—", color: "#e2e7e2" },
    preferredContact: {
      value: primary ? CHANNEL_LABELS[primary.prefers] : "—",
      color: "#e2e7e2",
    },
  };

  return META_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    value: values[f.key].value,
    color: values[f.key].color,
  }));
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

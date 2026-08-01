/**
 * Account-record field configuration.
 *
 * Every user-visible label on the Record screen lives here — section headings,
 * property-detail labels, meta-strip labels, quick-log buttons, suggestion
 * kinds and the toast copy. Components read from this module and **never**
 * contain a literal label string.
 *
 * The reason is concrete: the field set below was inferred from the v3
 * prototype because the real WOW OS deal-detail screen was not available when
 * this was designed (see the handoff's open questions). When that screen is
 * confirmed, the whole label set is remapped by editing this file — no
 * component changes, no re-layout.
 */

import type { ContactChannel } from "./types";

/* -------------------------------------------------------------------------
   Chrome — headings, buttons, static copy
   ------------------------------------------------------------------------- */

export type RecordFieldKey =
  /* header */
  | "backLabel"
  | "accountEyebrow"
  | "markLost"
  | "book"
  /* contacts */
  | "contactsHeading"
  | "contactsHeadingSuffix"
  | "addContact"
  | "prefersPrefix"
  /* property */
  | "propertyHeading"
  | "accessHeading"
  /* activity */
  | "activityHeading"
  | "activityCountSuffix"
  /* meta */
  | "recordHeading"
  /* next step */
  | "nextStepHeading"
  | "nextStateOk"
  | "nextStateOverdue"
  | "nextStateUnset"
  | "nextUnsetLabel"
  | "nextUnsetDue"
  /* suggestions */
  | "suggestionsHeading"
  | "suggestionsNote"
  | "suggestionDismiss"
  /* provenance annotation */
  | "inferredHeading"
  | "inferredBody";

export const RECORD_FIELDS: Record<RecordFieldKey, string> = {
  backLabel: "Pipelines",
  accountEyebrow: "ACCOUNT",
  markLost: "Mark lost",
  book: "Book Estimate",

  contactsHeading: "CONTACTS",
  contactsHeadingSuffix: "ON THIS ACCOUNT",
  addContact: "+ Add contact",
  prefersPrefix: "PREFERS",

  propertyHeading: "PROPERTY DETAILS",
  accessHeading: "ACCESS NOTES",

  activityHeading: "ACTIVITY · WITH PROVENANCE",
  activityCountSuffix: "travels to the estimate",

  recordHeading: "RECORD",

  nextStepHeading: "NEXT STEP",
  nextStateOk: "ON TRACK",
  nextStateOverdue: "OVERDUE",
  nextStateUnset: "NOT SET",
  nextUnsetLabel: "Not set",
  nextUnsetDue: "Required",

  suggestionsHeading: "Suggestions",
  suggestionsNote: "You approve every send",
  suggestionDismiss: "Dismiss",

  inferredHeading: "INFERRED — CONFIRM AGAINST REAL WOW OS SCREENS",
  inferredBody:
    "The Account/Contact record has no counterpart in the Funnel screenshots. Inferred here: the Account-over-Contacts hierarchy on one page (vs. separate pages), the property-detail field set, access notes styled as a caution block, and “assigned by” rendered as a provenance line rather than a field. Confirm the real deal-detail page and I’ll match it exactly.",
};

/** Every key in {@link RECORD_FIELDS}. Kept explicit so the test can assert
 *  the config is complete rather than merely self-consistent. */
export const RECORD_FIELD_KEYS: readonly RecordFieldKey[] = [
  "backLabel",
  "accountEyebrow",
  "markLost",
  "book",
  "contactsHeading",
  "contactsHeadingSuffix",
  "addContact",
  "prefersPrefix",
  "propertyHeading",
  "accessHeading",
  "activityHeading",
  "activityCountSuffix",
  "recordHeading",
  "nextStepHeading",
  "nextStateOk",
  "nextStateOverdue",
  "nextStateUnset",
  "nextUnsetLabel",
  "nextUnsetDue",
  "suggestionsHeading",
  "suggestionsNote",
  "suggestionDismiss",
  "inferredHeading",
  "inferredBody",
];

/* -------------------------------------------------------------------------
   Property / site details
   ------------------------------------------------------------------------- */

export type PropertyFieldKey =
  | "propertyType"
  | "squareFootage"
  | "paintUsed"
  | "trimCeilings"
  | "lastJob"
  | "crew";

export interface FieldSpec<K extends string> {
  key: K;
  label: string;
}

/**
 * The canonical property-detail field set, in render order. Values come from
 * `account.details` (a jsonb column), so the *stored* label is only a join
 * key — {@link propertyLabel} maps it onto the label configured here.
 */
export const PROPERTY_FIELDS: readonly FieldSpec<PropertyFieldKey>[] = [
  { key: "propertyType", label: "PROPERTY TYPE" },
  { key: "squareFootage", label: "SQUARE FOOTAGE" },
  { key: "paintUsed", label: "PAINT USED" },
  { key: "trimCeilings", label: "TRIM / CEILINGS" },
  { key: "lastJob", label: "LAST JOB" },
  { key: "crew", label: "CREW" },
];

/**
 * Stored `account.details` label → configured label. Match is
 * case/whitespace-insensitive so a seed that writes "Square footage" and one
 * that writes "SQUARE FOOTAGE" both resolve. Unknown labels pass through
 * upper-cased, so a field the real WOW OS screen adds still renders.
 */
export function propertyLabel(storedLabel: string): string {
  const norm = normalizeLabel(storedLabel);
  const match = PROPERTY_FIELDS.find((f) => normalizeLabel(f.label) === norm);
  return match ? match.label : storedLabel.toUpperCase();
}

function normalizeLabel(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/* -------------------------------------------------------------------------
   Meta strip (the RECORD panel)
   ------------------------------------------------------------------------- */

export type MetaFieldKey =
  | "source"
  | "assignedBy"
  | "owner"
  | "pipeline"
  | "businessType"
  | "preferredContact";

/** Render order and labels for the RECORD panel. */
export const META_FIELDS: readonly FieldSpec<MetaFieldKey>[] = [
  { key: "source", label: "Lead source" },
  { key: "assignedBy", label: "Assigned by" },
  { key: "owner", label: "Owner" },
  { key: "pipeline", label: "Pipeline" },
  { key: "businessType", label: "Business type" },
  { key: "preferredContact", label: "Preferred contact" },
];

/** Display casing for a contact's preferred channel. */
export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  SMS: "SMS",
  EMAIL: "Email",
  PHONE: "Phone",
};

/* -------------------------------------------------------------------------
   Quick log
   ------------------------------------------------------------------------- */

export type QuickLogKind = "Call" | "Text" | "Visit";

export const QUICK_LOG_ACTIONS: readonly FieldSpec<QuickLogKind>[] = [
  { key: "Call", label: "Log Call" },
  { key: "Text", label: "Log Text" },
  { key: "Visit", label: "Log Visit" },
];

/* -------------------------------------------------------------------------
   AI suggestions
   ------------------------------------------------------------------------- */

export type SuggestionId = "sg1" | "sg2" | "sg3";

export interface SuggestionSpec {
  id: SuggestionId;
  /** The section label on the card — "SUGGEST THE NEXT STEP", … */
  kind: string;
  /** Primary (approve) button label. */
  primary: string;
}

export const SUGGESTIONS: readonly SuggestionSpec[] = [
  { id: "sg1", kind: "SUGGEST THE NEXT STEP", primary: "Accept suggestion" },
  { id: "sg2", kind: "SUMMARIZE HISTORY", primary: "Insert as note" },
  { id: "sg3", kind: "DRAFT THE FOLLOW-UP", primary: "Review & send" },
];

/* -------------------------------------------------------------------------
   Toast copy
   ------------------------------------------------------------------------- */

export const RECORD_TOASTS = {
  primaryContact: (name: string) =>
    `${name} set as the primary contact for this account`,
  suggestionApproved: "Approved — logged with agent provenance",
  markLost: "Lost reason required — Price · Timing · Competitor · No response",
  addContact:
    "Add Contact — pick or create the Account, source required, everything else optional",
} as const;

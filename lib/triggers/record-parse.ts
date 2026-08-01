import type { sequenceSteps, touchpoints } from "@/db/schema";
import { addDays, addMonths } from "./dates";
import { lowerFirst, unpunctuated } from "./text";

/**
 * Reading facts out of free text.
 *
 * The prototype fixtures — and therefore the seed — carry some facts only as
 * human strings: "11 mo since job", "Aug 2025", "Interior repaint completed —
 * 4 rooms, hallway, stairwell". These parsers turn those into values the
 * predicates can reason about.
 *
 * They live apart from `fact-source.ts` for two reasons: they are pure and
 * database-free, so they can be unit-tested directly; and parsing a record is
 * a different job from querying one. Every function here is **total** — a
 * string it does not understand yields `null` or `[]`, never a throw and
 * never a guess.
 */

type TouchpointRow = typeof touchpoints.$inferSelect;
type SequenceStepRow = typeof sequenceSteps.$inferSelect;

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/* -------------------------------------------------------------------------
   Dates out of display strings
   ------------------------------------------------------------------------- */

/** "Aug 2025" → 2025-08-01. */
export function parseMonthYear(value: string | null): Date | null {
  if (!value) return null;
  const match = /([A-Za-z]{3,})\s+(\d{4})/.exec(value);
  if (!match) return null;
  const month = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  return new Date(Number(match[2]), month, 1);
}

/**
 * "Aug 15" → the next August 15 at or after `now`, so a bare month/day on a
 * record reads as a live deadline rather than one already missed.
 */
export function parseMonthDay(value: string | null, now: Date): Date | null {
  if (!value) return null;
  const match = /([A-Za-z]{3,})\s+(\d{1,2})\b/.exec(value);
  if (!match) return null;
  const month = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const day = Number(match[2]);
  const candidate = new Date(now.getFullYear(), month, day);
  return candidate.getTime() >= startOfToday(now).getTime()
    ? candidate
    : new Date(now.getFullYear() + 1, month, day);
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * "11 mo since job" · "lost 6 mo ago" · "19d silent" · "promo sent 3d ago"
 * → the instant that string describes.
 */
export function parseRelativeStale(stale: string, now: Date): Date | null {
  const months = /(\d+)\s*mo\b/.exec(stale);
  if (months) return addMonths(now, -Number(months[1]));
  const days = /(\d+)\s*d(?:ays?)?\b/.exec(stale);
  if (days) return addDays(now, -Number(days[1]));
  return null;
}

/** "Site drop-by · Jul 30" → this year's Jul 30, or last year's if ahead of now. */
export function parseInitialType(value: string | null, now: Date): Date | null {
  if (!value) return null;
  const match = /([A-Za-z]{3,})\s+(\d{1,2})\b/.exec(value);
  if (!match) return null;
  const month = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const day = Number(match[2]);
  const candidate = new Date(now.getFullYear(), month, day);
  return candidate.getTime() <= now.getTime()
    ? candidate
    : new Date(now.getFullYear() - 1, month, day);
}

/* -------------------------------------------------------------------------
   Absence
   ------------------------------------------------------------------------- */

/**
 * Account details are free text, and a field a rep has not filled in says so
 * in words: "None — new account", "Not captured yet", "No history on file".
 * Those record the *absence* of a fact and must never be rendered as one.
 *
 * This guard exists because of a real defect: a seasonal draft read "Prior
 * job history: interior, no history on file on file" — asserting a paint
 * preference exists on a record that explicitly says none does.
 */
export function isAbsent(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return true;
  return /^(none|n\/a|unknown|tbd)\b/.test(v) || /\b(no|not)\s+\w+/.test(v);
}

/* -------------------------------------------------------------------------
   Scope
   ------------------------------------------------------------------------- */

/**
 * Areas named on the completion record, which beats the account's standing
 * details because it says what was painted on *this* job.
 *
 *   "Interior repaint completed — 4 rooms, hallway, stairwell · $8,400"
 *                                          → ["hallway", "stairwell"]
 *
 * A bare count ("4 rooms") is dropped: it is a quantity, not a place, and
 * "touch up the 4 rooms zones" is not a sentence.
 */
export function jobScopeAreas(job: TouchpointRow | undefined): string[] {
  if (!job) return [];
  const structured = job.structured?.find((f) =>
    /\b(rooms?|areas?|scope)\b/i.test(f.label),
  );
  const source = structured?.value ?? job.body.split("—")[1]?.split("·")[0];
  return splitAreas(source);
}

/** Comma/and-separated area list → clean lowercase parts, counts removed. */
export function splitAreas(source: string | undefined): string[] {
  if (!source || isAbsent(source)) return [];
  return source
    .split(/,| and /i)
    .map((part) => lowerFirst(unpunctuated(part.trim())))
    .filter(
      (part) => part.length > 0 && part.length < 40 && !/^\d+\s+\w+$/.test(part),
    );
}

/* -------------------------------------------------------------------------
   People and accounts
   ------------------------------------------------------------------------- */

/**
 * A pronoun only when a rep has written one down. Names are never used as
 * evidence — guessing wrong puts a misgendering in a message a real customer
 * reads, which the neutral default never does.
 */
export function pronounFrom(notes: string): "she" | "he" | "they" | null {
  if (/\b(she|her|hers)\b/i.test(notes)) return "she";
  if (/\b(he|him|his)\b/i.test(notes)) return "he";
  if (/\b(they|them|their)\b/i.test(notes)) return "they";
  return null;
}

/**
 * A response habit a rep recorded, lifted verbatim: "replies within the
 * hour". Better evidence than anything computed, because a person observed it.
 */
export function replyNoteFrom(notes: string): string | null {
  for (const sentence of notes.split(/(?<=[.!?])\s+/)) {
    if (!/\brepl(?:y|ies|ied)\b/i.test(sentence)) continue;
    const trimmed = unpunctuated(sentence.trim());
    // "Warm, direct, replies within the hour" → "replies within the hour"
    const clause = trimmed.split(",").find((part) => /\brepl/i.test(part)) ?? trimmed;
    return lowerFirst(clause.trim());
  }
  return null;
}

const CORPORATE_SUFFIXES = new Set([
  "development", "developments", "group", "construction", "holdings",
  "partners", "properties", "management", "services", "co.", "co",
  "llc", "inc.", "inc", "corp.", "corp",
]);

/** "Northgate Development" → "Northgate". Left alone when already short. */
export function shortAccountName(name: string): string {
  const words = name.split(/\s+/);
  if (words.length < 2) return name;
  const last = words[words.length - 1].toLowerCase();
  return CORPORATE_SUFFIXES.has(last) ? words.slice(0, -1).join(" ") : name;
}

/* -------------------------------------------------------------------------
   Sequences
   ------------------------------------------------------------------------- */

/**
 * Which day of the sequence a step lands on. A label a human wrote ("Day 3
 * phone call") beats arithmetic; otherwise sum the delays that came before it.
 */
export function dayInSequence(
  steps: SequenceStepRow[],
  stepNumber: number,
): number {
  const step = steps.find((s) => s.stepNumber === stepNumber);
  const labelled = step ? /\bday\s+(\d+)\b/i.exec(step.label) : null;
  if (labelled) return Number(labelled[1]);

  const cumulative = steps
    .filter((s) => s.stepNumber < stepNumber)
    .reduce((total, s) => total + s.delayDays, 0);
  return cumulative + 1;
}

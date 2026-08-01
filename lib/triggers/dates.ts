/**
 * Date arithmetic for the trigger predicates.
 *
 * Every helper is pure and takes `now` explicitly — no `Date.now()` anywhere
 * in the trigger layer. That is what makes the predicates unit-testable at
 * exact boundary dates.
 *
 * Calendar months, not 30-day approximations: "11 months since the job" has
 * to mean the same thing to the predicate that it means to the homeowner.
 */

export const MS_PER_DAY = 86_400_000;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Whole days between two instants, floored. Negative when `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Whole calendar months elapsed. A partial month does not count: from
 * Aug 15 to Jul 14 is 10 months, to Jul 15 it is 11.
 */
export function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

/** Midnight-to-midnight comparison, so "fired today" ignores the clock. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function monthName(date: Date): string {
  return MONTHS[date.getMonth()];
}

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

/** "September 2025" — the form the WHY THIS FIRED bullets use. */
export function monthYear(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Aug 2025" — the compact form the card subtitles use. */
export function monthYearShort(date: Date): string {
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/** "August 15" — the form the drafted copy uses for a deadline. */
export function monthDay(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Aug 15" — the compact form the card subtitles use. */
export function monthDayShort(date: Date): string {
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
}

/**
 * How a person would refer to the month a job finished: "last August" once
 * the year has turned, "in August" inside the current year.
 */
export function completionPhrase(completedAt: Date, now: Date): string {
  const prefix = completedAt.getFullYear() < now.getFullYear() ? "last" : "in";
  return `${prefix} ${MONTHS[completedAt.getMonth()]}`;
}

/**
 * How a person would refer to a recent send: "Monday" inside the last week,
 * "on August 3" beyond it.
 */
export function recentSendPhrase(sentAt: Date, now: Date): string {
  const days = daysBetween(sentAt, now);
  if (days >= 0 && days <= 6) return WEEKDAYS[sentAt.getDay()];
  return `on ${monthDay(sentAt)}`;
}

/**
 * The next weekday an estimator could realistically be offered — a few days
 * out, never a weekend. Used when the copy offers to hold a slot.
 */
export function nextWeekdaySlot(now: Date, offsetDays = 3): Date {
  const slot = addDays(now, offsetDays);
  while (slot.getDay() === 0 || slot.getDay() === 6) {
    slot.setDate(slot.getDate() + 1);
  }
  return slot;
}

/** Which season we are booking into — meteorological, from the month. */
export function seasonName(date: Date): string {
  const m = date.getMonth();
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}


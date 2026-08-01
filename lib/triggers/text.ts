/**
 * Small text helpers shared by the predicates and the template drafter.
 *
 * They exist so that reasoning bullets and drafted copy read like a person
 * wrote them — "last two replies", "hallway and stairwell" — while still
 * being generated straight from record facts.
 */

const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** "two" for 2, "14" for 14. Prose spells small numbers out. */
export function countWord(n: number): string {
  return n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n);
}

/** "hallway and stairwell" · "kitchen, hallway and stairwell". */
export function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

export function pluralMonths(n: number): string {
  return n === 1 ? "1 month" : `${n} months`;
}

/**
 * How fast they answer, in the words a rep would use. Drives the channel
 * justification bullet — never stated unless replies were actually observed.
 */
export function latencyPhrase(medianMinutes: number): string {
  if (medianMinutes <= 60) return "within the hour";
  if (medianMinutes <= 60 * 6) return "the same afternoon";
  if (medianMinutes <= 60 * 24) return "within the day";
  const days = Math.round(medianMinutes / (60 * 24));
  return `within ${pluralDays(days)}`;
}

/** Lowercases a record label for mid-sentence use without touching acronyms. */
export function lowerFirst(text: string): string {
  if (!text) return text;
  const [first, ...rest] = text.split(" ");
  const isAcronym = first.length > 1 && first === first.toUpperCase();
  return isAcronym ? text : [first.toLowerCase(), ...rest].join(" ");
}

/** Drops a trailing period so a fact can be embedded in a longer sentence. */
export function unpunctuated(text: string): string {
  return text.replace(/[.\s]+$/, "");
}

/**
 * A duration as a person would say it out loud: "8 minutes", "1 hour 30
 * minutes", "2 days".
 *
 * The remainder is kept deliberately. This renders the age of an unworked
 * lead in an alert whose entire purpose is conveying how long somebody has
 * been left waiting — flooring 90 minutes to "1 hour" understates the very
 * thing the reader is being asked to act on. Rounding up would overstate it,
 * which is no better; say the number.
 */
export function humaniseMinutes(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    const hourPart = hours === 1 ? "1 hour" : `${hours} hours`;
    // Below five minutes the remainder is noise, not information.
    if (rest < 5) return hourPart;
    return `${hourPart} ${rest} minutes`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  const dayPart = days === 1 ? "1 day" : `${days} days`;
  if (restHours < 1) return dayPart;
  return `${dayPart} ${restHours === 1 ? "1 hour" : `${restHours} hours`}`;
}

/**
 * A span of days as a person would say it: "22 days", "14 months", "2 years".
 *
 * One helper rather than per-site arithmetic, because the WHY THIS FIRED panel
 * puts several durations next to each other and they have to agree. Deriving
 * one bullet from calendar months and its neighbour from `days / 30` produced
 * "Enquired June 2025 (13 months ago)" directly above "Untouched for 14
 * months" — same elapsed time, two numbers, in the panel whose entire job is
 * being trustworthy at a glance.
 */
export function humaniseDays(days: number): string {
  if (days < 1) return "less than a day";
  if (days < 60) return pluralDays(days);

  // 30.44 is the mean month; /30 drifts by a month across a year.
  const months = Math.round(days / 30.44);
  if (months < 24) return pluralMonths(months);

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = years === 1 ? "1 year" : `${years} years`;
  return rest === 0 ? yearPart : `${yearPart} ${pluralMonths(rest)}`;
}

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

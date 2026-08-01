import type { ParsedNote } from "./types";

/**
 * Deterministic transcript → structure parser.
 *
 * This is the *primary* path, not a fallback: there is no ANTHROPIC_API_KEY in
 * most environments, so the Field screen has to structure a note convincingly
 * with nothing but a regex grammar. Claude (lib/voice/claude.ts) improves the
 * prose when a key is present and falls back here on any error.
 *
 * The grammar is deliberately small and readable: a timeframe resolver, an
 * ordered list of next-step cues, an outcome classifier, a scope extractor
 * (rooms + work types + colour/brand) and a deadline/constraint extractor.
 */

/* -------------------------------------------------------------------------
   Normalisation
   ------------------------------------------------------------------------- */

/** Curly punctuation makes every regex below twice as long. Flatten it first. */
function normalise(input: string): string {
  return input
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sentenceCase(input: string): string {
  const s = input.trim().replace(/[.\s]+$/, "");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/* -------------------------------------------------------------------------
   Dates and timeframes
   ------------------------------------------------------------------------- */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  a: "1",
  an: "1",
  both: "2",
  couple: "2",
};

function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** The next `target` weekday at least `minOffset` days out. */
function nextWeekday(from: Date, target: number, minOffset: number): Date {
  const d = addDays(from, minOffset);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return d;
}

function formatDate(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

interface Timeframe {
  /** How it reads in the next-step label: "this week", "Friday", "tomorrow". */
  phrase: string;
  date: Date | null;
}

const TIMEFRAME_RE = new RegExp(
  [
    "\\b(today|tonight|tomorrow)\\b",
    "\\b(this week|next week|this month|next month)\\b",
    "\\bend of (?:the )?(week|month)\\b",
    "\\bin (\\d+|a couple of|a couple|a few) days?\\b",
    "\\b(?:on |by |this |next )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b",
  ].join("|"),
  "i",
);

function matchTimeframe(text: string, now: Date): Timeframe | null {
  const m = TIMEFRAME_RE.exec(text);
  if (!m) return null;
  const [, simple, span, endOf, inDays, weekday] = m;

  if (simple) {
    const key = simple.toLowerCase();
    if (key === "today" || key === "tonight") {
      return { phrase: key, date: addDays(now, 0) };
    }
    return { phrase: "tomorrow", date: addDays(now, 1) };
  }

  if (span) {
    const key = span.toLowerCase();
    // "this week" reads as mid-week; "next week" as the start of the next one.
    if (key === "this week") return { phrase: key, date: nextWeekday(now, 4, 2) };
    if (key === "next week") return { phrase: key, date: nextWeekday(now, 2, 7) };
    return { phrase: key, date: null };
  }

  if (endOf) {
    const key = endOf.toLowerCase();
    if (key === "week") {
      return { phrase: "end of the week", date: nextWeekday(now, 5, 1) };
    }
    return { phrase: "end of the month", date: null };
  }

  if (inDays) {
    const key = inDays.toLowerCase();
    const n = /^\d+$/.test(key) ? Number(key) : key.includes("few") ? 3 : 2;
    return { phrase: `in ${n} days`, date: addDays(now, n) };
  }

  if (weekday) {
    const key = weekday.toLowerCase();
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    return { phrase: label, date: nextWeekday(now, WEEKDAY_INDEX[key], 1) };
  }

  return null;
}

/** True when a clause is *only* a timing phrase — "by Tuesday" is not a constraint. */
function isBareTimeframe(clause: string): boolean {
  const stripped = clause
    .toLowerCase()
    .replace(TIMEFRAME_RE, "")
    .replace(/\b(the|then|at|latest|so|please|if you can)\b/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
  return stripped.length === 0;
}

/* -------------------------------------------------------------------------
   Next step
   ------------------------------------------------------------------------- */

interface NextStepRule {
  test: RegExp;
  /** Either a fixed label or a builder over the match. */
  label: string | ((m: RegExpExecArray) => string);
}

const NEXT_STEP_RULES: NextStepRule[] = [
  {
    test: /\b(?:left (?:a |her |him |them )?voicemail|no answer|didn't (?:pick up|answer)|went to voicemail)\b/i,
    label: "Call back",
  },
  {
    test: /\b(?:get|send|bring|have|line up)\s+(?:an?\s+)?estimator\b/i,
    label: "Book estimate",
  },
  {
    test: /\b(?:book|schedule|set up|get)\s+(?:an?\s+|the\s+)?(estimate|walk-?through|site visit|meeting|inspection|measure)\b/i,
    label: (m) => `Book ${m[1].toLowerCase().replace("walkthrough", "walk-through")}`,
  },
  {
    test: /\b(?:send|email|text|get)\s+(?:her|him|them|over|out)?\s*(?:a\s+|the\s+)?(quote|estimate|proposal|bid|invoice|contract)\b/i,
    label: (m) => `Send ${m[1].toLowerCase()}`,
  },
  {
    test: /\b(?:drop (?:off|by)|deliver)\b/i,
    label: "Drop off materials",
  },
  {
    test: /\bsend\s+(?:her|him|them)?\s*(?:the\s+)?(?:info|packet|brochure|samples?|colou?r (?:chips|samples|deck))\b/i,
    label: "Send materials",
  },
  { test: /\bcall (?:her|him|them)?\s*back\b/i, label: "Call back" },
  { test: /\btry (?:again|back|her|him|them)\b/i, label: "Try again" },
  { test: /\bfollow(?:ing)?[- ]?up\b/i, label: "Follow up" },
];

function extractNextStep(text: string, now: Date): { step: string; tf: Timeframe | null } {
  let base = "";
  for (const rule of NEXT_STEP_RULES) {
    const m = rule.test.exec(text);
    if (m) {
      base = typeof rule.label === "string" ? rule.label : rule.label(m);
      break;
    }
  }
  if (!base) base = "Follow up";

  const tf = matchTimeframe(text, now);
  return { step: tf ? `${base} ${tf.phrase}` : base, tf };
}

/* -------------------------------------------------------------------------
   Scope: rooms, work types, colour and brand
   ------------------------------------------------------------------------- */

const ROOMS = [
  "powder room",
  "living room",
  "dining room",
  "family room",
  "laundry room",
  "master bedroom",
  "guest room",
  "mud room",
  "stairwell",
  "stairway",
  "staircase",
  "hallway",
  "bedrooms",
  "bedroom",
  "bathrooms",
  "bathroom",
  "kitchen",
  "basement",
  "attic",
  "garage",
  "office",
  "closets",
  "closet",
  "foyer",
  "entryway",
  "porch",
  "deck",
  "fence",
  "siding",
  "shutters",
  "soffits",
  "gutters",
  "baseboards",
  "ceilings",
  "ceiling",
  "railings",
  "railing",
  "cabinets",
  "trim",
  "doors",
  "walls",
  "exterior",
  "interior",
];

const ROOM_MODIFIERS =
  "upstairs|downstairs|upper|lower|front|back|rear|main|master|guest|spare|first[- ]floor|second[- ]floor|ground[- ]floor";

const ROOM_RE = new RegExp(
  `\\b(?:(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|both|a couple of)\\s+)?` +
    `(?:(${ROOM_MODIFIERS})\\s+)?` +
    `(${ROOMS.join("|")})\\b`,
  "gi",
);

const WORK_TYPES: [RegExp, string][] = [
  [/\btouch[- ]?ups?\b/i, "touch-ups"],
  [/\brepaint(?:ed|ing)?\b/i, "repaint"],
  [/\bpaint(?:ed|ing)?\b/i, "paint"],
  [/\bpatch(?:ed|ing)?\b/i, "patch"],
  [/\bdrywall\b/i, "drywall"],
  [/\bskim ?coat\b/i, "skim coat"],
  [/\b(?:pressure|power) ?wash(?:ing)?\b/i, "pressure wash"],
  [/\bstain(?:ed|ing)?\b/i, "stain"],
  [/\bcaulk(?:ed|ing)?\b/i, "caulk"],
  [/\bprim(?:er|ing|ed)\b/i, "primer"],
  [/\bwallpaper\b/i, "wallpaper"],
];

const BRANDS: [RegExp, string][] = [
  [/\bbenjamin moore\b/i, "Benjamin Moore"],
  [/\bsherwin[- ]williams\b/i, "Sherwin-Williams"],
  [/\bfarrow (?:&|and) ball\b/i, "Farrow & Ball"],
  [/\bvalspar\b/i, "Valspar"],
  [/\bbehr\b/i, "Behr"],
  [/\bkilz\b/i, "Kilz"],
  [/\bppg\b/i, "PPG"],
];

const COLOURS: [RegExp, string][] = [
  [/\boff[- ]white\b/i, "off-white"],
  [/\beggshell\b/i, "eggshell"],
  [/\bsemi[- ]gloss\b/i, "semi-gloss"],
  [/\bmatte\b/i, "matte"],
  [/\bsatin\b/i, "satin"],
  [/\bgreige\b/i, "greige"],
  [/\bcharcoal\b/i, "charcoal"],
  [/\bnavy\b/i, "navy"],
  [/\bbeige\b/i, "beige"],
  [/\btaupe\b/i, "taupe"],
  [/\bcream\b/i, "cream"],
  [/\bsage\b/i, "sage"],
  [/\bgr[ae]y\b/i, "grey"],
  // Guard the hyphen so "off-white" doesn't also register a bare "white".
  [/(?<!-)\bwhite\b/i, "white"],
];

function extractRooms(text: string): string[] {
  const found: string[] = [];
  ROOM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROOM_RE.exec(text)) !== null) {
    const [, rawCount, modifier, room] = m;
    const count = rawCount
      ? (NUMBER_WORDS[rawCount.toLowerCase().replace("a couple of", "couple")] ??
        (/^\d+$/.test(rawCount) ? rawCount : ""))
      : "";
    found.push(
      [count, modifier?.toLowerCase(), room.toLowerCase()]
        .filter(Boolean)
        .join(" "),
    );
  }
  return unique(found);
}

function extractMatches(text: string, table: [RegExp, string][]): string[] {
  return unique(table.filter(([re]) => re.test(text)).map(([, label]) => label));
}

function buildScopeNotes(text: string): string {
  const rooms = extractRooms(text);
  const work = extractMatches(text, WORK_TYPES);
  const brands = extractMatches(text, BRANDS);
  const colours = extractMatches(text, COLOURS);

  const parts: string[] = [];

  if (rooms.length) {
    const head = sentenceCase(rooms.join(", "));
    parts.push(work.length ? `${head} — ${work.join(", ")}` : head);
  } else if (work.length) {
    parts.push(sentenceCase(work.join(", ")));
  }

  if (brands.length || colours.length) {
    const spec = [brands.join(" / "), colours.join(" / ")]
      .filter(Boolean)
      .join(" ");
    const match = /\b(?:to )?match(?:ing)? (?:the )?existing\b|\bsame\b/i.test(text)
      ? " to match existing"
      : "";
    parts.push(sentenceCase(`${spec}${match}`));
  }

  return parts.length ? `${parts.join(". ")}.` : "";
}

/* -------------------------------------------------------------------------
   Outcome
   ------------------------------------------------------------------------- */

const OUTCOME_RULES: [RegExp, string][] = [
  [
    /\b(?:left (?:a |her |him |them )?voicemail|no answer|didn't (?:pick up|answer)|went to voicemail)\b/i,
    "Left a voicemail — no contact made",
  ],
  [
    /\b(?:not interested|passed on|going with (?:someone|another)|went with another|declined)\b/i,
    "Not interested — closed out",
  ],
  [
    /\b(?:walk(?:ed|ing)?(?: the| through| around)?|on site|met (?:with|her|him|them)|walk-?through|stopped by|door knock)\b/i,
    "Connected on site",
  ],
  [
    /\b(?:spoke (?:with|to)|talked to|caught (?:her|him|them)|on the phone|called (?:her|him|them))\b/i,
    "Spoke with the customer",
  ],
  [/\b(?:texted|sent (?:her|him|them)? ?a text|she replied|he replied)\b/i, "Exchanged texts"],
];

const SCOPE_GROWTH_RE =
  /\b(?:now wants|also wants|as well|on top of that|in addition|added|wants .{0,40}? too)\b/i;

function extractOutcome(text: string, all: string[]): string {
  let base = "";
  for (const [re, label] of OUTCOME_RULES) {
    if (re.test(text)) {
      base = label;
      break;
    }
  }
  if (!base) base = truncate(sentenceCase(all[0] ?? ""), 110);
  if (!base) return "";

  const growth = SCOPE_GROWTH_RE.exec(text);
  if (!growth) return base;

  // Scope the "what got added" read to the clause the growth cue sits in.
  const sentence = all.find((s) => SCOPE_GROWTH_RE.test(s)) ?? text;
  const at = SCOPE_GROWTH_RE.exec(sentence);
  const tail = at ? sentence.slice(at.index) : sentence;
  const added = extractRooms(tail);
  if (!added.length) return base;

  return `${base} — scope grew to include ${added.join(", ")}`;
}

/* -------------------------------------------------------------------------
   Constraint
   ------------------------------------------------------------------------- */

const MONTHS_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

const EVENT_WORDS = [
  "wedding",
  "graduation",
  "closing",
  "listing",
  "open house",
  "move-in",
  "move in",
  "inspection",
  "holidays",
  "thanksgiving",
  "christmas",
  "party",
  "reunion",
  "anniversary",
  "baby",
  "guests",
  "end of the month",
  "end of the year",
  "end of summer",
  "school year",
  "semester",
];
const EVENT_RE = new RegExp(`\\b(${EVENT_WORDS.join("|")})\\b`, "i");

const DEADLINE_RE = /\b(?:before|by|ahead of|prior to|in time for)\s+([^.;,]+)/gi;

const BUDGET_RE =
  /\b(?:budget is|budget of|can't go (?:over|above)|no more than|keep it under|cap(?:ped)? at|under)\s*(\$ ?[\d,]+(?:\.\d{2})?|[\d,]{3,})/i;

const ACCESS_RE =
  /\b(gate code|lockbox|alarm code|dogs?|no parking|park (?:in|on) the (?:alley|street)|side entrance)\b/i;

function cleanEventPhrase(clause: string): string {
  let phrase = clause
    .replace(/^\s*(?:her|his|their|our|my|the|a|an)\s+/i, "")
    .replace(/\s+in\s+[a-z]+$/i, "")
    .replace(/\s+(?:on|of)\s+[a-z]+\s+\d{1,2}$/i, "")
    .trim();

  const event = EVENT_RE.exec(phrase);
  if (event) {
    // Keep the head that qualifies the event ("daughter's wedding"), drop the rest.
    phrase = phrase.slice(0, event.index + event[0].length).trim();
  }
  const words = phrase.split(" ");
  if (words.length > 6) phrase = words.slice(-6).join(" ");
  return phrase;
}

function extractConstraint(text: string): string {
  const parts: string[] = [];

  DEADLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEADLINE_RE.exec(text)) !== null) {
    const clause = m[1].trim();
    if (!clause || isBareTimeframe(clause)) continue;

    const month = MONTHS_RE.exec(clause);
    const hasEvent = EVENT_RE.test(clause);
    // A bare "by the front door" is not a deadline. Require a month or an event.
    if (!month && !hasEvent) continue;

    const monthLabel = month
      ? month[1].charAt(0).toUpperCase() + month[1].slice(1).toLowerCase()
      : "";
    const phrase = hasEvent ? cleanEventPhrase(clause) : "";

    if (monthLabel && phrase) parts.push(`Must complete before ${monthLabel} — ${phrase}`);
    else if (monthLabel) parts.push(`Must complete before ${monthLabel}`);
    else parts.push(`Must complete before ${phrase}`);
    break;
  }

  const budget = BUDGET_RE.exec(text);
  if (budget) parts.push(`Budget ceiling ${budget[1].replace(/\s/g, "")}`);

  const access = ACCESS_RE.exec(text);
  if (access) parts.push(`Access: ${access[1].toLowerCase()}`);

  return parts.join(" · ");
}

/* -------------------------------------------------------------------------
   Entry point
   ------------------------------------------------------------------------- */

const EMPTY: ParsedNote = {
  outcome: "",
  nextStep: "",
  date: "",
  notes: "",
  constraint: "",
  dueAt: null,
};

/**
 * Structure a spoken field note. `now` is injectable so the suggested date is
 * deterministic in tests.
 */
export function parseTranscriptDeterministic(
  transcript: string,
  now: Date = new Date(),
): ParsedNote {
  const text = normalise(transcript);
  if (!text) return { ...EMPTY };

  const all = sentences(text);
  const { step, tf } = extractNextStep(text, now);

  return {
    outcome: extractOutcome(text, all),
    nextStep: step,
    date: tf?.date ? formatDate(tf.date) : "",
    notes: buildScopeNotes(text),
    constraint: extractConstraint(text),
    dueAt: tf?.date ? tf.date.toISOString() : null,
  };
}

/**
 * The 25 prototype leads, transcribed verbatim from
 * `design-refs/WOW Leads v3.dc.html` lines 904–931.
 *
 * This is seed data, not runtime data — nothing outside `scripts/seed.ts` and
 * the unit tests should import it. The board reads deals from the database.
 */

import type {
  DealAction,
  DealMetric,
  LeadSource,
  NextAction,
  TrackId,
} from "@/lib/types";
import type { PipelineId } from "@/lib/types";

export interface DealFixture {
  id: string;
  pipe: PipelineId;
  track?: TrackId;
  stage: string;
  name: string;
  account: string;
  tags: string[];
  source: LeadSource;
  owner: { initials: string; name: string; agent: boolean };
  assignedBy: string;
  aiPending?: boolean;
  stale: string;
  staleWarn?: boolean;
  metrics?: DealMetric[];
  seq?: number;
  seqName?: string;
  seqStep?: string;
  next: NextAction | null;
  act: DealAction;
  quick: boolean;
  osRef?: string;
  initialType?: string;
  /** The job whose crew this neighbour walked past. */
  sourcedFromDealId?: string;
  /** Lost stages only. Both are required together — a loss with no reason is a gap. */
  lostReason?: string;
  lostDaysAgo?: number;
  /** Paused stages only. ISO date the deal comes due again. */
  revisitDate?: string;
}

export const DEAL_FIXTURES: DealFixture[] = [
  {
    id: "r1",
    pipe: "resi",
    track: "repeat",
    stage: "past",
    name: "Delia Marchetti",
    account: "2712 Cathedral Ave NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Past Customer",
    owner: { initials: "AI", name: "Re-marketing agent", agent: true },
    assignedBy: "Trigger → Dani",
    aiPending: true,
    stale: "11 mo since job",
    staleWarn: false,
    metrics: [
      { label: "LAST JOB", value: "$8,400" },
      { label: "COMPLETED", value: "Aug 2025" },
    ],
    next: {
      label: "Warranty check-in — approve the draft",
      due: "Drafted today · awaiting you",
      state: "ok",
    },
    act: "Review draft",
    quick: true,
  },
  {
    id: "r2",
    pipe: "resi",
    track: "referral",
    stage: "past",
    name: "Ondrej Vasek",
    account: "1518 Newton St NW",
    tags: ["DIRECT HOMEOWNER", "EXTERIOR"],
    source: "Yard Sign",
    owner: { initials: "DK", name: "Dani Koval", agent: false },
    assignedBy: "Self-sourced",
    stale: "4 mo since job",
    metrics: [
      { label: "LAST JOB", value: "$12,100" },
      { label: "NPS", value: "10" },
    ],
    next: { label: "Ask for a referral", due: "Today 3:00 PM", state: "ok" },
    act: "Log Call",
    quick: true,
  },
  {
    id: "r3",
    pipe: "resi",
    track: "referral",
    stage: "first",
    name: "Priya Ramanathan",
    account: "4412 Illinois Ave NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Google Ads",
    owner: { initials: "DK", name: "Dani Koval", agent: false },
    assignedBy: "Self-sourced",
    stale: "touched 2d ago",
    metrics: [
      { label: "LAST JOB", value: "$6,250" },
      { label: "REFERRALS", value: "1" },
    ],
    next: {
      label: "Second ask — she named a neighbour",
      due: "Tomorrow 10:00 AM",
      state: "ok",
    },
    act: "Send Text",
    quick: true,
  },
  {
    id: "r4",
    pipe: "resi",
    track: "repeat",
    stage: "second",
    name: "Grant Whitfield",
    account: "1201 Half St SE",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Past Customer",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "SH → Reese",
    stale: "19d silent",
    staleWarn: true,
    metrics: [
      { label: "LAST JOB", value: "$4,900" },
      { label: "COMPLETED", value: "Feb 2025" },
    ],
    next: {
      label: "Second follow-up on the basement",
      due: "Was due 5 days ago",
      state: "overdue",
    },
    act: "Log Call",
    quick: true,
  },
  {
    id: "r5",
    pipe: "resi",
    track: "repeat",
    stage: "promo",
    name: "Yuki Tanabe",
    account: "1710 8th St NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Web Form",
    owner: { initials: "AI", name: "Re-marketing agent", agent: true },
    assignedBy: "Trigger → Dani",
    aiPending: true,
    stale: "promo sent 3d ago",
    metrics: [
      { label: "OFFER", value: "15% spring" },
      { label: "EXPIRES", value: "Aug 15" },
    ],
    next: {
      label: "Follow up on the promo — draft ready",
      due: "Drafted today · awaiting you",
      state: "ok",
    },
    act: "Review draft",
    quick: true,
  },
  {
    id: "r6",
    pipe: "resi",
    track: "revival",
    stage: "second",
    name: "Rudy Kaminski",
    account: "410 Galloway St NE",
    tags: ["DIRECT HOMEOWNER", "EXTERIOR"],
    source: "Door Hanger",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Revival trigger",
    stale: "lost 6 mo ago",
    metrics: [
      { label: "LOST FOR", value: "Price" },
      { label: "ORIGINAL", value: "$5,600" },
    ],
    next: {
      label: "Revival call — 6-month cooling done",
      due: "Thu 11:00 AM",
      state: "ok",
    },
    act: "Log Call",
    quick: true,
  },
  {
    id: "r7",
    pipe: "resi",
    track: "referral",
    stage: "followed",
    name: "Harold Vessey",
    account: "5807 Nevada Ave NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Partner Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Bright Path RE → Reese",
    stale: "touched 4d ago",
    metrics: [
      { label: "REFERRALS", value: "2" },
      { label: "ATTRIBUTED", value: "$21,300" },
    ],
    next: {
      label: "Thank-you call + referral card",
      due: "Fri 9:00 AM",
      state: "ok",
    },
    act: "Log Call",
    quick: true,
  },
  {
    id: "r8",
    pipe: "resi",
    track: "repeat",
    stage: "result",
    name: "Lorna Kirkbride",
    account: "2308 Tunlaw Rd NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Past Customer",
    owner: { initials: "DK", name: "Dani Koval", agent: false },
    assignedBy: "Trigger → Dani",
    stale: "booked yesterday",
    osRef: "EST-40218",
    metrics: [
      { label: "SCOPE", value: "3 rooms" },
      { label: "EST. VALUE", value: "$7,100" },
    ],
    next: {
      label: "Estimator on site",
      due: "Thu 10:00 AM · Kris Jolin",
      state: "ok",
    },
    act: "View in Funnel",
    quick: false,
  },
  {
    id: "r9",
    pipe: "resi",
    track: "revival",
    stage: "result",
    name: "Simone Achterberg",
    account: "61 Rhode Island Ave NW",
    tags: ["DIRECT HOMEOWNER", "EXTERIOR"],
    source: "Google Ads",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Revival trigger",
    stale: "closed 2d ago",
    metrics: [
      { label: "RESULT", value: "Not now" },
      { label: "RETRY", value: "Spring 2027" },
    ],
    next: {
      label: "Re-enter revival in 8 months",
      due: "Mar 2027 · scheduled",
      state: "ok",
    },
    act: "Log Call",
    quick: false,
  },

  /* Never quoted: contact details on file, no job and no estimate. They sit in
     Eligible alongside past customers because the ladder is the same — the
     track is what tells a rep there is no prior number to reference. */
  {
    id: "r10",
    pipe: "resi",
    track: "neverquoted",
    stage: "past",
    name: "Adaeze Nwosu",
    account: "3117 Adams Mill Rd NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Landing Page",
    owner: { initials: "DK", name: "Dani Koval", agent: false },
    assignedBy: "Self-sourced",
    stale: "enquired 14 mo ago",
    metrics: [
      { label: "ENQUIRED", value: "Jun 2025" },
      { label: "QUOTED", value: "Never" },
    ],
    next: {
      label: "First ask — no quote on file",
      due: "Fri 2:00 PM",
      state: "ok",
    },
    act: "Log Call",
    quick: true,
  },
  {
    id: "r11",
    pipe: "resi",
    track: "neverquoted",
    stage: "first",
    name: "Bertrand Oyelowo",
    account: "1622 Varnum St NW",
    tags: ["DIRECT HOMEOWNER", "EXTERIOR"],
    source: "Home Show",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Self-sourced",
    stale: "22d silent",
    staleWarn: true,
    metrics: [
      { label: "ENQUIRED", value: "Home show" },
      { label: "QUOTED", value: "Never" },
    ],
    next: {
      label: "Second ask — still no scope captured",
      due: "Was due 3 days ago",
      state: "overdue",
    },
    act: "Log Call",
    quick: true,
  },

  {
    id: "c1",
    pipe: "comm",
    stage: "prospect",
    name: "Kepler Ridge Phase II",
    account: "Vantage Construction Group",
    tags: ["GENERAL CONTRACTOR", "EXTERIOR"],
    source: "GC Referral",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Self-sourced",
    stale: "touched 3d ago",
    metrics: [
      { label: "EST. VALUE", value: "$180K" },
      { label: "DECISION", value: "Oct 2026" },
    ],
    next: { label: "Intro meeting with the PM", due: "Tue 9:00 AM", state: "ok" },
    act: "Log Call",
    quick: true,
  },
  {
    id: "c2",
    pipe: "comm",
    stage: "invited",
    name: "Marlowe Commons — 4 buildings",
    account: "Redstone Property Management",
    tags: ["PROPERTY MANAGER", "EXTERIOR"],
    source: "Partner Referral",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Bright Path RE → Jorden",
    stale: "touched 6d ago",
    metrics: [
      { label: "EST. VALUE", value: "$310K" },
      { label: "BID DUE", value: "Aug 22" },
    ],
    next: {
      label: "Confirm walk-through date",
      due: "Tomorrow 2:00 PM",
      state: "ok",
    },
    act: "Log Call",
    quick: true,
  },
  {
    id: "c3",
    pipe: "comm",
    stage: "takeoff",
    name: "Ivy City Warehouse facade",
    account: "Nnamdi Holdings",
    tags: ["FACILITY MANAGER", "EXTERIOR"],
    source: "Cold Call",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Self-sourced",
    stale: "16d silent",
    staleWarn: true,
    metrics: [
      { label: "EST. VALUE", value: "$96K" },
      { label: "TAKEOFF", value: "60%" },
    ],
    next: {
      label: "Finish the takeoff",
      due: "Was due 4 days ago",
      state: "overdue",
    },
    act: "Log Visit",
    quick: true,
  },
  {
    id: "c4",
    pipe: "comm",
    stage: "submitted",
    name: "Hillcrest HOA — 62 units",
    account: "Hillcrest Homeowners Association",
    tags: ["HOA BOARD", "EXTERIOR"],
    source: "Web Form",
    owner: { initials: "DK", name: "Dani Koval", agent: false },
    assignedBy: "SH → Dani",
    stale: "touched 5d ago",
    metrics: [
      { label: "BID", value: "$244K" },
      { label: "DECISION", value: "Sep 9" },
    ],
    next: { label: "Board Q&A session", due: "Sep 4 · 6:30 PM", state: "ok" },
    act: "Log Call",
    quick: true,
  },
  {
    id: "c5",
    pipe: "comm",
    stage: "negotiation",
    name: "Union Market — 3 suites",
    account: "Delaine Retail Partners",
    tags: ["PROPERTY MANAGER", "INTERIOR"],
    source: "GC Referral",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Self-sourced",
    stale: "touched 2d ago",
    metrics: [
      { label: "BID", value: "$88K" },
      { label: "GAP", value: "−$6K" },
    ],
    next: {
      label: "Send revised scope option B",
      due: "Today 4:00 PM",
      state: "ok",
    },
    act: "Send Text",
    quick: true,
  },
  {
    id: "c6",
    pipe: "comm",
    stage: "hold",
    name: "Eckington Lofts repaint",
    account: "Adeyemi Property Group",
    tags: ["PROPERTY MANAGER", "INDUSTRIAL"],
    source: "Past Customer",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Self-sourced",
    stale: "on hold 3 wks",
    metrics: [
      { label: "BID", value: "$132K" },
      { label: "REVISIT", value: "Jan 2027" },
    ],
    next: {
      label: "Budget-cycle check-in",
      due: "Jan 8 2027 · scheduled",
      state: "ok",
    },
    act: "Log Call",
    quick: true,
    // The paused case the reconcile doc names: a real date, so the deal is
    // measured by "is it due yet" rather than tripping the 45-day rule while
    // sitting exactly where somebody deliberately put it.
    revisitDate: "2027-01-08",
  },

  {
    id: "b1",
    pipe: "bizdev",
    stage: "initial",
    name: "Calla Sørensen",
    account: "Meridian Facilities Co.",
    tags: ["FACILITY MANAGER", "INDUSTRIAL"],
    source: "Cold Call",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Self-sourced",
    stale: "day 3 of 10",
    seqName: "Commercial 4-touch",
    seqStep: "Step 2 of 4",
    seq: 2,
    next: { label: "Day 3 phone call", due: "Today 11:00 AM", state: "ok" },
    act: "Log Call",
    quick: true,
    initialType: "Cold call · Jul 28",
  },
  {
    id: "b2",
    pipe: "bizdev",
    stage: "initial",
    name: "Desmond Achebe",
    account: "Northgate Development",
    tags: ["GENERAL CONTRACTOR", "EXTERIOR"],
    source: "Door Hanger",
    owner: { initials: "AI", name: "Prospecting agent", agent: true },
    assignedBy: "Sequence → Jorden",
    aiPending: true,
    stale: "day 1 of 10",
    seqName: "Commercial 4-touch",
    seqStep: "Step 1 of 4",
    seq: 1,
    next: {
      label: "Intro email — draft ready",
      due: "Drafted today · awaiting you",
      state: "ok",
    },
    act: "Review draft",
    quick: true,
    initialType: "Site drop-by · Jul 30",
  },
  {
    id: "b3",
    pipe: "bizdev",
    stage: "followup",
    name: "Marguerite Loeb",
    account: "Loeb & Sons Flooring",
    tags: ["INDUSTRY PARTNER", "INTERIOR"],
    source: "Partner Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "SH → Reese",
    stale: "day 7 of 10",
    seqName: "Partner intro",
    seqStep: "Step 3 of 4",
    seq: 3,
    next: { label: "Drop off the info packet", due: "Thu 2:00 PM", state: "ok" },
    act: "Log Visit",
    quick: true,
    initialType: "Referral intro · Jul 21",
  },
  {
    id: "b4",
    pipe: "bizdev",
    stage: "followup",
    name: "Tobias Wren",
    account: "Wren Industrial Services",
    tags: ["FACILITY MANAGER", "INDUSTRIAL"],
    source: "Cold Call",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Self-sourced",
    stale: "21d silent",
    staleWarn: true,
    seqName: "Commercial 4-touch",
    seqStep: "Step 4 of 4",
    seq: 4,
    next: {
      label: "Final follow-up email",
      due: "Was due 8 days ago",
      state: "overdue",
    },
    act: "Send Text",
    quick: true,
    initialType: "Cold call · Jul 8",
  },
  {
    id: "b5",
    pipe: "bizdev",
    stage: "meeting",
    name: "Ingrid Salcedo",
    account: "Cascade Realty Group",
    tags: ["INDUSTRY PARTNER", "INTERIOR"],
    source: "Partner Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Self-sourced",
    stale: "meeting set",
    seqName: "Partner intro",
    seqStep: "Complete",
    seq: 4,
    next: {
      label: "First meeting — their office",
      due: "Mon 10:00 AM",
      state: "ok",
    },
    act: "Log Visit",
    quick: true,
    initialType: "Warm intro · Jul 14",
  },

  {
    id: "p1",
    pipe: "partner",
    stage: "active",
    name: "Bright Path Real Estate",
    account: "3 agents · Dupont & Logan",
    tags: ["INDUSTRY PARTNER"],
    source: "Partner Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Self-sourced",
    stale: "referral 6d ago",
    metrics: [
      { label: "REFERRALS SENT", value: "14" },
      { label: "ATTRIBUTED", value: "$96K" },
    ],
    next: { label: "Quarterly lunch", due: "Aug 12 · booked", state: "ok" },
    act: "Log Visit",
    quick: true,
  },
  {
    id: "p2",
    pipe: "partner",
    stage: "active",
    name: "Loeb & Sons Flooring",
    account: "Marguerite Loeb · owner",
    tags: ["INDUSTRY PARTNER"],
    source: "GC Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "SH → Reese",
    stale: "referral 2d ago",
    metrics: [
      { label: "REFERRALS SENT", value: "8" },
      { label: "ATTRIBUTED", value: "$51K" },
    ],
    next: {
      label: "Send co-marketing flyer proof",
      due: "Tomorrow",
      state: "ok",
    },
    act: "Send Text",
    quick: true,
  },
  {
    id: "p3",
    pipe: "partner",
    stage: "introduced",
    name: "Kestrel Home Staging",
    account: "Nadia Kestrel · principal",
    tags: ["INDUSTRY PARTNER"],
    source: "Partner Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Bright Path RE → Reese",
    stale: "introduced 9d ago",
    metrics: [
      { label: "REFERRALS SENT", value: "1" },
      { label: "ATTRIBUTED", value: "$7.4K" },
    ],
    next: {
      label: "Coffee — agree on referral terms",
      due: "Wed 8:30 AM",
      state: "ok",
    },
    act: "Log Visit",
    quick: true,
  },
  {
    id: "p4",
    pipe: "partner",
    stage: "identified",
    name: "Halvorsen Windows & Doors",
    account: "Erik Halvorsen · sales lead",
    tags: ["INDUSTRY PARTNER"],
    source: "Cold Call",
    owner: { initials: "AI", name: "Prospecting agent", agent: true },
    assignedBy: "Sequence → Reese",
    stale: "not yet contacted",
    metrics: [
      { label: "REFERRALS SENT", value: "0" },
      { label: "FIT SCORE", value: "High" },
    ],
    next: { label: "Intro call", due: "Fri 1:00 PM", state: "ok" },
    act: "Log Call",
    quick: true,
  },
  {
    id: "p5",
    pipe: "partner",
    stage: "dormant",
    name: "Tanager Interiors",
    account: "Pia Tanager · designer",
    tags: ["INDUSTRY PARTNER"],
    source: "Partner Referral",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Self-sourced",
    stale: "5 mo no referral",
    staleWarn: true,
    metrics: [
      { label: "REFERRALS SENT", value: "6" },
      { label: "ATTRIBUTED", value: "$38K" },
    ],
    next: {
      label: "Re-engagement call",
      due: "Was due 11 days ago",
      state: "overdue",
    },
    act: "Log Call",
    quick: true,
    // Dormant is a paused stage, so neglect no longer watches it. Without a
    // date this partner was excluded from that alert and generated no revisit
    // signal either — invisible at 152 days silent. Six weeks out puts it back
    // on a list and matches the rule paused stages now enforce.
    revisitDate: "2026-09-14",
  },
  {
    /*
     * The Residential loss the revival trigger was written for and has never
     * had. Lost on price eight months ago, so the six-month cooling period is
     * comfortably past and the flow is demonstrable rather than theoretical.
     * `lostReason` is what the trigger selects on — a loss without one is a
     * deal that vanished, not a deal we can win back.
     */
    id: "r12",
    pipe: "resi",
    track: "revival",
    stage: "resi-lost",
    name: "Colm Ferreira",
    account: "934 Kennedy St NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Google Ads",
    owner: { initials: "DK", name: "Dani Koval", agent: false },
    assignedBy: "Self-sourced",
    stale: "lost 8 mo ago",
    metrics: [
      { label: "LOST FOR", value: "Price" },
      { label: "ORIGINAL", value: "$7,900" },
    ],
    next: {
      label: "Revival window open — 8 months since the quote",
      due: "Mon 9:00 AM",
      state: "ok",
    },
    act: "Log Call",
    quick: true,
    lostReason: "price",
    lostDaysAgo: 243,
  },

  /* -----------------------------------------------------------------------
     New Leads — net-new residential demand. Nobody here has worked with us
     before, so there is no history to lean on and speed to first contact is
     the whole game. Fixtures match the board Marshall specified.
     ----------------------------------------------------------------------- */

  {
    id: "n1",
    pipe: "newleads",
    // No track chip: New Leads surfaces the source as a card metric instead.
    track: undefined,
    stage: "new",
    name: "Marisol Freire",
    account: "3320 Brown St NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Facebook Ads",
    owner: { initials: "AI", name: "Intake agent", agent: true },
    assignedBy: "Web form → unassigned",
    aiPending: true,
    stale: "14 min old",
    metrics: [
      { label: "SOURCE", value: "Google Ads" },
      { label: "ASKED FOR", value: "3 rooms" },
    ],
    next: {
      label: "First call — draft text ready",
      due: "Now · speed-to-lead",
      state: "ok",
    },
    act: "Review draft",
    quick: true,
  },
  {
    id: "n2",
    pipe: "newleads",
    // No track chip: New Leads surfaces the source as a card metric instead.
    track: undefined,
    stage: "new",
    name: "Oyelaran Bankole",
    // Nobody picked this one up, which is the whole story: unassigned, one
    // voicemail, then silence past the one-day window.
    account: "905 Rhode Island Ave NE",
    tags: ["DIRECT HOMEOWNER", "EXTERIOR"],
    source: "Yard Sign",
    owner: { initials: "—", name: "Unassigned", agent: false },
    assignedBy: "Yard sign → unassigned",
    stale: "26 hr silent",
    staleWarn: true,
    metrics: [
      { label: "SOURCE", value: "Yard sign" },
      // Value is derived at seed time from `sourcedFromDealId`, never typed.
      { label: "NEIGHBOUR OF", value: "" },
    ],
    next: {
      label: "Call back — left voicemail",
      due: "Was due 18 hours ago",
      state: "overdue",
    },
    act: "Log Call",
    quick: true,
    sourcedFromDealId: "r8",
  },
  {
    id: "n3",
    pipe: "newleads",
    // No track chip: New Leads surfaces the source as a card metric instead.
    track: undefined,
    stage: "contacted",
    name: "Hollis Trent",
    account: "2214 Newton St NE",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Nextdoor",
    owner: { initials: "JB", name: "Jorden Bhatt", agent: false },
    assignedBy: "Canvass → Jorden",
    stale: "touched 1d ago",
    metrics: [
      { label: "SOURCE", value: "Canvassing" },
      { label: "ASKED FOR", value: "Stairwell" },
    ],
    next: {
      label: "Send the ballpark range",
      due: "Today 4:00 PM",
      state: "ok",
    },
    act: "Send Text",
    quick: true,
  },
  {
    id: "n4",
    pipe: "newleads",
    // No track chip: New Leads surfaces the source as a card metric instead.
    track: undefined,
    stage: "qualified",
    name: "Renata Vasquez",
    account: "618 Quincy St NW",
    tags: ["DIRECT HOMEOWNER", "INTERIOR"],
    source: "Landing Page",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Self-sourced",
    stale: "touched 3h ago",
    metrics: [
      { label: "BUDGET", value: "$5–7K" },
      { label: "TIMING", value: "Aug" },
    ],
    next: {
      label: "Book the estimate walk-through",
      due: "Tomorrow 9:00 AM",
      state: "ok",
    },
    act: "Log Visit",
    quick: true,
  },
  {
    id: "n5",
    pipe: "newleads",
    // No track chip: New Leads surfaces the source as a card metric instead.
    track: undefined,
    stage: "booked",
    name: "Theo Lindqvist",
    account: "1445 Otis Pl NW",
    tags: ["DIRECT HOMEOWNER", "EXTERIOR"],
    source: "Job Site",
    owner: { initials: "RA", name: "Reese Alvarado", agent: false },
    assignedBy: "Self-sourced",
    stale: "booked 1d ago",
    osRef: "EST-40311",
    /**
     * The second lead off the Tunlaw job, and the one that carries a number:
     * without a priced lead the attribution panel can only say "1 lead", which
     * is the one thing it exists not to say. Deliberately no `NEIGHBOUR OF`
     * metric — that claim belongs to the lead literally next door. The link
     * means the job produced the lead, which also covers a referral from the
     * customer or someone who saw the crew working.
     */
    sourcedFromDealId: "r8",
    metrics: [
      { label: "EST. VALUE", value: "$9,100" },
      { label: "WALK", value: "Aug 4" },
    ],
    next: {
      label: "Estimator confirmed — nothing to do",
      due: "Aug 4 · 8:30 AM",
      state: "ok",
    },
    act: "View in Funnel",
    quick: false,
  },
];

/** Prototype owner initials → seeded user id. AI owners map to agent ids. */
export const OWNER_USER_BY_INITIALS: Record<string, string> = {
  MB: "u-marshall",
  DK: "u-dani",
  JB: "u-jorden",
  RA: "u-reese",
};

/** `owner.name` → agent id, for the two AI owners on the board. */
export const AGENT_ID_BY_OWNER_NAME: Record<string, string> = {
  "Re-marketing agent": "agent-remarketing",
  "Prospecting agent": "agent-prospecting",
  "Intake agent": "agent-intake",
};

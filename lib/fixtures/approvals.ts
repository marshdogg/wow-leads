/**
 * The three approval fixtures, transcribed from
 * `design-refs/WOW Leads v3.dc.html` lines 1018–1040.
 *
 * `recipient` is not in the prototype — the seed fills it from the deal's
 * primary contact so the queue shows who the draft is actually addressed to.
 */

import type { TriggerType } from "@/lib/types";

export interface ApprovalFixture {
  id: string;
  dealId: string;
  triggerType: TriggerType;
  title: string;
  subtitle: string;
  chip: string;
  channel: string;
  body: string;
  reasons: string[];
  footnote: string;
  agentId: string;
}

export const APPROVAL_FIXTURES: ApprovalFixture[] = [
  {
    id: "a1",
    dealId: "r1",
    triggerType: "eleven_month",
    title: "11-Month Touchpoint · Delia Marchetti",
    subtitle:
      "Interior repaint completed Aug 2025 · $8,400 · Residential Re-marketing",
    chip: "TRIGGER FIRED TODAY",
    channel: "SMS · she prefers text",
    body: "Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty inspection is coming up on the interior work we finished last August. It is a good moment to touch up the hallway and stairwell zones that take the most traffic. Want me to bring an estimator by in the next couple of weeks?",
    reasons: [
      "Job completed 11 months ago — inside the warranty-inspection window",
      "No contact since the completion follow-up in September 2025",
      "High-traffic interior scope: hallway and stairwell were in the original job",
      "Prefers SMS; last two replies came within the hour",
    ],
    footnote:
      "Nothing sends until you approve. Approving logs the send against Delia with agent provenance and sets the next step.",
    agentId: "agent-remarketing",
  },
  {
    id: "a2",
    dealId: "r5",
    triggerType: "seasonal",
    title: "Seasonal promo follow-up · Yuki Tanabe",
    subtitle: "15% spring interior offer sent 3 days ago · expires Aug 15",
    chip: "SEQUENCE STEP",
    channel: "EMAIL",
    body: "Hi Yuki — checking in on the spring interior offer we sent Monday. It holds until August 15 and covers the kitchen and stairwell we talked through last year. Happy to hold a Thursday slot if that helps you decide.",
    reasons: [
      "Promo sent 3 days ago with no open or reply",
      "Offer expires in 15 days — the window closes",
      "Prior job history: interior, low-VOC preference on file",
    ],
    footnote:
      "Second and final chase on this offer. If she does not respond the deal parks with a spring 2027 retry.",
    agentId: "agent-remarketing",
  },
  {
    id: "a3",
    dealId: "b2",
    triggerType: "sequence",
    title: "Sequence step 1 · Desmond Achebe",
    subtitle: "Northgate Development · Commercial 4-touch · Biz Dev",
    chip: "SEQUENCE STEP",
    channel: "EMAIL",
    body: "Desmond — Marshall with WOW 1 DAY PAINTING. We finished exterior work on two Vantage Construction sites in NE this spring, one-day turnarounds on occupied buildings. If Northgate has repaint scope coming on the Rhode Island Ave project, I would like ten minutes to show you how we sequence around trades.",
    reasons: [
      "Day 1 of the Commercial 4-touch sequence",
      "Account tagged GENERAL CONTRACTOR — matches our best-fit profile",
      "Adjacent GC (Vantage) already an active account — usable reference",
    ],
    footnote:
      "Day 3 phone call and Day 7 packet drop generate automatically once this sends.",
    agentId: "agent-prospecting",
  },
];

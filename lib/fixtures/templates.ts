/**
 * The message copy WOW ships, lifted from `lib/agents/template-drafter.ts`.
 *
 * The drafter builds each body by *branching* — it adds the "we finished last
 * August" clause only when there is a completion date, the "touch up the
 * hallway and stairwell" sentence only when areas were logged. Templates have
 * no `if`, so each branch becomes its own row and the resolver's eligibility
 * rule does the choosing: a template naming `{{job.completedMonth}}` is simply
 * not offered to a record without one, and a plainer sibling is picked up
 * instead. Same outcome, expressed as data.
 *
 * **Within one family the rows share a scope**, so `resolveTemplate` separates
 * them on `updatedAt` — richest first. `order` below sets that deliberately;
 * it is not incidental. See the note in the seed report.
 */

import type { MessageTemplate } from "@/lib/templates/types";

export interface TemplateFixture
  extends Omit<MessageTemplate, "authoredBy" | "updatedAt"> {
  /**
   * Rank within a family, 0 = richest. Becomes `updatedAt`, which is what
   * breaks the tie between same-scope siblings.
   */
  order: number;
}

const SENDER = "{{sender.firstName}} at {{sender.company}}";

export const TEMPLATE_FIXTURES: TemplateFixture[] = [
  /* ---- 11-month warranty ------------------------------------------------ */
  {
    id: "tpl-eleven-month-full",
    name: "11-month warranty check-in — with rooms",
    channel: "ANY",
    triggerType: "eleven_month",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. Your one-year warranty inspection is coming up on the {{job.workType}} work we finished {{job.completedMonth}}. It is a good moment to touch up the {{job.areas}} zones that take the most traffic. Want me to bring an estimator by in the next couple of weeks?`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-eleven-month-dated",
    name: "11-month warranty check-in — no rooms logged",
    channel: "ANY",
    triggerType: "eleven_month",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. Your one-year warranty inspection is coming up on the {{job.workType}} work we finished {{job.completedMonth}}. It is a good moment to walk the job and catch anything worth touching up while the warranty is live. Want me to bring an estimator by in the next couple of weeks?`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },
  {
    id: "tpl-eleven-month-base",
    name: "11-month warranty check-in — no completion date",
    channel: "ANY",
    triggerType: "eleven_month",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. Your one-year warranty inspection is coming up on the {{job.workType}} work we did for you. It is a good moment to walk the job and catch anything worth touching up while the warranty is live. Want me to bring an estimator by in the next couple of weeks?`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 2,
  },

  /* ---- Seasonal promo --------------------------------------------------- */
  {
    id: "tpl-seasonal-full",
    name: "Seasonal promo follow-up — dated offer",
    channel: "ANY",
    triggerType: "seasonal",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: "Your {{promo.label}} offer",
    body: `Hi {{contact.firstName}} — checking in on the {{promo.label}} offer we sent {{promo.sentWhen}}. It holds until {{promo.expires}} and covers the {{job.areas}} we talked through. Happy to hold a {{promo.slot}} slot if that helps you decide.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-seasonal-no-scope",
    name: "Seasonal promo follow-up — no prior scope",
    channel: "ANY",
    triggerType: "seasonal",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: "Your {{promo.label}} offer",
    body: `Hi {{contact.firstName}} — checking in on the {{promo.label}} offer we sent {{promo.sentWhen}}. It holds until {{promo.expires}}. Happy to hold a {{promo.slot}} slot if that helps you decide.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },
  {
    id: "tpl-seasonal-base",
    name: "Seasonal promo follow-up — open-ended offer",
    channel: "ANY",
    triggerType: "seasonal",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: "Your {{promo.label}} offer",
    body: `Hi {{contact.firstName}} — checking in on the {{promo.label}} offer. The offer is still open. Happy to hold a {{promo.slot}} slot if that helps you decide.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 2,
  },

  /* ---- Revival ---------------------------------------------------------- */
  {
    id: "tpl-revival-full",
    name: "Revival after a price loss — full quote history",
    channel: "ANY",
    triggerType: "revival",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. We quoted your {{loss.scope}} at {{loss.value}} back in {{loss.month}} and price was the sticking point. Our {{season}} schedule has room, and I can put a tighter phased option in front of you. Worth a ten-minute call this week?`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-revival-base",
    name: "Revival after a price loss — scope only",
    channel: "ANY",
    triggerType: "revival",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. We quoted your {{loss.scope}} and price was the sticking point. Our {{season}} schedule has room, and I can put a tighter phased option in front of you. Worth a ten-minute call this week?`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },

  /* ---- Biz Dev sequence -------------------------------------------------
     No work type in this copy. `job.workType` is strictly job-derived and a
     cold prospect has no completed job, so naming it would make every
     sequence template permanently ineligible. The registry has no token for
     "the work type on this account" — see the note in the report; with one
     these read "one-day exterior turnarounds" again.

     Step number isn't a scope dimension, but the Biz Dev stages carry the
     same distinction: `initial` is the cold intro, `followup` is everything
     after it. Scoping on stage says the same thing in the vocabulary the
     resolver already has.
     ---------------------------------------------------------------------- */
  {
    id: "tpl-sequence-intro-reference",
    name: "Sequence intro — with a reference account",
    channel: "ANY",
    triggerType: "sequence",
    pipelineId: "bizdev",
    stageId: "initial",
    track: null,
    subject: "Ten minutes on your repaint scope",
    body: `{{prospect.firstName}} — {{sender.firstName}} with {{sender.company}}. We finished work on {{reference.proof}}, one-day turnarounds on occupied buildings. If {{prospect.company}} has repaint scope coming, I would like ten minutes to show you how we sequence around trades.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-sequence-intro-base",
    name: "Sequence intro — no reference to name",
    channel: "ANY",
    triggerType: "sequence",
    pipelineId: "bizdev",
    stageId: "initial",
    track: null,
    subject: "Ten minutes on your repaint scope",
    body: `{{prospect.firstName}} — {{sender.firstName}} with {{sender.company}}. We run one-day turnarounds on occupied buildings — crews in and out inside a shift. If {{prospect.company}} has repaint scope coming, I would like ten minutes to show you how we sequence around trades.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },
  {
    id: "tpl-sequence-followup-reference",
    name: "Sequence follow-up — with a reference account",
    channel: "ANY",
    triggerType: "sequence",
    pipelineId: "bizdev",
    stageId: "followup",
    track: null,
    subject: "Following up",
    body: `{{prospect.firstName}} — {{sender.firstName}} again. Following up on my earlier note. We have active work on {{reference.proof}} if you want a reference before we talk. Still worth ten minutes on your upcoming repaint scope? I can work around your trade schedule.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-sequence-followup-base",
    name: "Sequence follow-up — no reference to name",
    channel: "ANY",
    triggerType: "sequence",
    pipelineId: "bizdev",
    stageId: "followup",
    track: null,
    subject: "Following up",
    body: `{{prospect.firstName}} — {{sender.firstName}} again. Following up on my earlier note. Still worth ten minutes on your upcoming repaint scope? I can work around your trade schedule.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },

  /* ---- Neighbour campaign -----------------------------------------------
     Two rules these must not break, both inherited from the drafter. They
     never name the recipient — a canvassed address has no contact on file and
     inventing one is worse than an unaddressed opener. And they never assert
     anything about the neighbour's own house; "if you have been thinking
     about your exterior" is a conditional, "your trim is looking tired" would
     be a claim about property nobody has looked at.
     ---------------------------------------------------------------------- */
  {
    id: "tpl-neighbour-full",
    name: "Neighbour campaign — crew still on site",
    channel: "ANY",
    triggerType: "neighbour_campaign",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi — ${SENDER}. We just finished the {{job.workType}} at {{job.address}}, {{neighbour.proximity}}. The crew is in the neighbourhood through {{crew.until}}, so if you have been thinking about your {{job.workType}} I can have an estimator take a look while we are already here.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-neighbour-proximity",
    name: "Neighbour campaign — crew already gone",
    channel: "ANY",
    triggerType: "neighbour_campaign",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi — ${SENDER}. We just finished the {{job.workType}} at {{job.address}}, {{neighbour.proximity}}. If you have been thinking about your {{job.workType}} I can have an estimator take a look while we are already here.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },
  {
    id: "tpl-neighbour-base",
    name: "Neighbour campaign — distance not recorded",
    channel: "ANY",
    triggerType: "neighbour_campaign",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi — ${SENDER}. We just finished the {{job.workType}} at {{job.address}} nearby. If you have been thinking about your {{job.workType}} I can have an estimator take a look while we are already here.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 2,
  },

  /* ---- Never quoted ------------------------------------------------------
     The opener has to match how we actually met them. "You asked about" is
     false for a hand shaken at a home show; "we met" is false for a landing
     page. Each row is one true version rather than one row hedging.
     ---------------------------------------------------------------------- */
  {
    id: "tpl-never-quoted-event",
    name: "Never quoted — met at an event",
    channel: "ANY",
    triggerType: "never_quoted",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. We met at {{enquiry.channel}} and talked about getting your place painted, and I do not think we ever got you a proper number. If it is still on your list I can have someone take a look and price it properly this time.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 0,
  },
  {
    id: "tpl-never-quoted-dated",
    name: "Never quoted — dated enquiry",
    channel: "ANY",
    triggerType: "never_quoted",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. You asked about getting some painting done {{enquiry.month}} and I do not think we ever got you a proper number. If it is still on your list I can have someone take a look and price it properly this time.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 1,
  },
  {
    id: "tpl-never-quoted-base",
    name: "Never quoted — nothing on file but the enquiry",
    channel: "ANY",
    triggerType: "never_quoted",
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: `Hi {{contact.firstName}} — ${SENDER}. You got in touch about getting some painting done and I do not think we ever got you a proper number. If it is still on your list I can have someone take a look and price it properly this time.`,
    active: true,
    // Shipped copy is send-as-written. Turning adaptation on is a decision
    // a franchise makes about their own words, not one we make for them.
    allowAiAdaptation: false,
    isDefault: true,
    order: 2,
  },
];

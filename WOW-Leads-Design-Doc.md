# WOW Leads — Design Brief

**A lead & prospecting tool built into WOW OS**

Owner: Marshall (WOW 1 DAY PAINTING)
Status: Draft for design review
Audience: Claude design + product
Date: July 29, 2026

---

> **⚠️ Read this first — partially superseded.** Stakeholder feedback (July 31) expanded the scope. Where this PRD and `WOW-Leads-Demo-Spec.md` disagree, **the demo spec wins.** Specifically:
> - **Stages are per-pipeline, not global.** §7's stage set is now just the *default residential-inbound* pipeline. There are four motions — Residential Re-marketing, Commercial Bid, Biz Dev/Prospecting, Industry Partner — each with its own stages.
> - **The data model is Account + Contact + Deal**, not a flat Lead (§6 expands accordingly: account tags, property details, preferred contact method, assigned-by).
> - **The automation engine and mobile capture are core scope**, not future state — sequences, triggers (11-month touchpoint, seasonal, lost-lead revival), one-tap/voice logging, manager dashboards.
>
> Still fully valid here: §3 (human-first, AI-ready architecture), §4 (single capture + the booking seam with the WOW OS Funnel), §10 (visual system & consistency rules), §12 (success criteria).

## 0. How to use this document

This is a design brief, not a finished spec. It states the problem, the users, the guiding architecture, the workflow model, and — in §10 — how WOW Leads should look and behave so it feels native to WOW OS. Anywhere it says "proposed" or "recommend," treat it as a starting point. Open questions are collected in §11.

The design guidance in §10 is derived from a WOW OS Funnel screenshot (Appendix B) and an early WOW Leads board mockup. Screens not shown there (a lead detail/record page) are inferred and marked as such.

---

## 1. Problem

There is **no dedicated lead & prospecting tool in WOW OS today.** Leads and early-stage prospects are handled ad hoc — spreadsheets, inboxes, notes, and memory — with nothing purpose-built to capture them, work them, and convert them into booked estimates.

*(Pipedrive appears in Appendix A only as inspiration for the pipeline concept — a familiar example of a lead board. It is not a system we run and is not the thing being replaced.)*

Three gaps result:

**The lead → booked-estimate handoff is fragile.** When a prospect becomes a booked estimate there is no guaranteed path carrying their history, source, and notes into the WOW OS Funnel. Context is re-keyed or lost, and the estimator starts half-blind.

**Outbound prospecting has no home.** Net-new lead generation and structured outreach live in scattered spreadsheets and inboxes no one can see — or don't happen at all.

**Pipeline and activity aren't legible to owners.** There's no single place to see who (or what) is working leads, how fast, what's converting to a booked estimate, and how that looks across locations.

---

## 2. Goals & non-goals

### Goals
1. **Tighten the lead → booked-estimate handoff.** A qualified lead becomes a deal in the WOW OS Funnel with zero re-keying and full history intact. The single most important outcome.
2. **Give prospecting/outbound a real home.** Net-new lead generation and structured outreach as a first-class activity.
3. **Make pipeline and rep activity legible to owners.** Reporting and accountability across reps and locations: conversion, speed-to-lead, activity, pipeline health.

### Non-goals (this version)
- Rebuilding a generic, full-feature CRM. WOW Leads is purpose-built for the painting lead → booked-estimate journey, not a catch-all sales database.
- Estimate creation, job scheduling, crew management, invoicing — everything downstream of the booked estimate. WOW Leads hands off *to* the Funnel; it does not own it.
- Marketing campaign management / ad attribution beyond capturing a lead's source.

---

## 3. Guiding architecture: build for humans, support AI

WOW Leads is designed **human-first, AI-ready.** Reps use it today; the underlying model is built so AI can progressively take over touchpoints without a rebuild. The human UI is *one client of the system, not the system itself.* This principle governs every decision below.

- **Every human action is also a callable operation.** Logging a call, advancing a stage, booking the estimate, marking Lost with a reason — each is a structured, first-class operation an agent could invoke later. Nothing is UI-only. The board is a *view* over the model.
- **Structured data over free text.** Every touchpoint records machine-readable outcomes (result, next step, qualification answers, source), not just notes. This is what makes the record actionable by an agent.
- **One rich lead record = shared context.** The full history is the handoff surface between human and AI; either can pick up mid-thread with complete context. It matters *more* under AI, since an agent both consumes and generates that context.
- **Provenance on every action.** Each state change records who did it — which rep, or which agent. Required the moment AI touches anything: trust, audit, debugging.
- **"Next best action" is the spine.** Every lead always has a next step with an owner. Today the owner is a rep working the queue; tomorrow an agent, or an agent proposing and a human approving. The card's "NEXT" block is that shared control point and already works both ways.
- **Escalation seams from day one.** Build the "hand up to a human / hand down to AI" boundary now, while humans do everything. That is the dial that lets autonomy slide in per-stage, per-lead-value, per-franchise later.
- **AI assistive-first, autonomous-later.** Near term, AI lives inside the human flow — drafting the follow-up, summarizing history, suggesting the next step/stage — the same operations a human triggers, just recommended. Trust before autonomy.
- **Outcomes are training signal.** The reporting layer that shows owners what's converting is the same labeled data that teaches an agent which cadence books estimates. Oversight and learning are one instrument.

### Future state (design target, not v1 scope)
As AI takes the touchpoints, the board stops being a work queue and becomes **telemetry.** The human surface trends toward (a) an **exception/escalation queue** — humans only touch leads the AI routes up (customer asks for a person, high-value/complex commercial job, complaint, edge case) — and (b) an **oversight dashboard**: booked-per-lead, escalation rate, time-to-book, conversation quality/confidence, cost per booked estimate. Design the board so it can gracefully become a monitor.

---

## 4. Capture model & the seam with the WOW OS Funnel

WOW Leads owns the **top of the funnel** and ends at the **booked estimate.** The existing WOW OS **Funnel** (Appendix B) owns everything from there.

### 4.1 Single capture — one record per prospect
The WOW OS Funnel's "New Deal" stage is, in practice, a place to capture a customer and nurture them — the **same job** as WOW Leads' New Lead. That is full overlap, not partial. The resolution is **one capture action and one record:**

- Adding a prospect always creates a **Lead**, never a Funnel deal. `+ Add Deal` in WOW OS is repointed to lead capture (or renamed `+ Add Lead`).
- The Funnel's "New Deal" stage is **absorbed** — it stops being a capture/nurture point. The Funnel never holds un-booked prospects.
- A prospect becomes a Funnel deal **only at booking** → enters at **Estimate Scheduled**, carrying the full lead record.
- Do **not** create a Lead *and* a Deal that sync — two records for one person is exactly the context-loss problem this project exists to kill.

### 4.2 The seam
```
WOW LEADS (new)                                     WOW OS FUNNEL (exists today)
──────────────────────────────────────  ▐BOOKING▌  ─────────────────────────────────────────────────
New Lead → Trying to Reach → Following Up   →→→→→    Estimate Scheduled → Qualified → Proposal Presented → Proposal Accepted
                                                     (Qualified here = post-booking pre-visit contact —
                                                      NOT the same as any Leads stage; see §7.4)
```
Booking the estimate **is** the handoff. Leads' terminal positive state and the Funnel's "Estimate Scheduled" are the same moment.

> Open question (§11): does anything land in the Funnel from *outside* a human — an online booking widget, a franchise import, a partner feed? If so, those feeds route into lead capture too, not into the Funnel.

---

## 5. Users

**Primary — Sales rep / estimator.** Works leads day to day; needs to know instantly who to contact next and how to move a lead toward a booked estimate. Success = more booked estimates with less admin.

**Primary — Franchise owner.** Monitors pipeline health and rep (and, over time, AI) performance for their location(s). Scoped by the existing **Switch Franchise** control. Success = confidence nothing falls through the cracks + clear visibility into what's converting.

**Secondary (scope flags).** CSR/front desk doing first intake (where does capture start?); corporate/brand rolling data across locations (likely a later phase).

---

## 6. Core concepts & data model (proposed)

**Lead** — a person/household or business who may want painting work. Fields: name, contact, address/service area, source, stage, owner, category (Residential/Commercial), job type (Interior/Exterior), optional budget, created date, last activity, next activity/due. Every field structured for machine use (§3).

**Source** — where the lead came from (web form, phone, referral, prior customer, outbound). Required — owners need source→conversion reporting, and the CA$0 problem proves optional metadata goes unfilled.

**Event** — an *instant* worth recording as a timestamp for metrics: lead created, first outreach attempt, first live contact, qualified, booked. Events are not columns (§7).

**Activity / Next-best-action** — the scheduled next step (call, text, email, visit) with an owner (rep or agent). Every lead always has one; a lead with none is the primary "falling through the cracks" signal. This is the human/AI shared control point (§3).

**Stage** — a *resting state* (a column) = a distinct next action (§7).

**Provenance** — who/what performed each action (rep name or agent id). On every state change and activity.

**Booked estimate** — the exit event; converting a lead creates the Funnel deal in Estimate Scheduled with full history attached.

**Prospect list / campaign** (outbound) — a named set of net-new targets worked on a cadence, distinct from inbound leads until they respond.

---

## 7. The lead pipeline

### 7.1 Events vs. resting states
Two different things were previously conflated. **Events** are instants (created, first outreach, first contact, qualified, booked) — track them as timestamps/metrics, not columns. **Resting states** are where a lead sits waiting; each is a column and each must earn its place with a *distinct next action.* If two stages share a next action, they are one stage.

### 7.2 Stages (resting states)
1. **New Lead** — captured, we owe them first contact. Next action: reach out now. (Speed-to-lead clock runs.)
2. **Trying to Reach** — we've reached out, no response yet. Next action: another attempt, different channel, on a cadence. *Historically the biggest leak point.*
3. **Following Up** — connected and it's a real prospect, not booked yet (checking calendar, deciding, timing later). Next action: a scheduled follow-up. *(Rename note: this bucket holds both hot "call today" and cold "check back in the fall"; "Nurturing" undersells the hot ones, so "Following Up" / "Working" is preferred. Keep "Nurturing" only if it's your team's vocabulary.)*
4. **Estimate Booked** — appointment set → converts to a Funnel deal at Estimate Scheduled. Exit.
5. **Lost** — genuine disqualification or not interested. Requires a structured **lost reason** (not interested, unqualified, price, timing, competitor, no response, other). Reachable from any state.

Why not "Contact Made" and "Engaged" as columns: connecting is a *moment*, not a place a lead rests — after connecting a lead is immediately booked, following up, or lost. So "Contact Made" is an **event** (it stops the speed-to-lead clock), not a column. "Engaged" sat empty on the example board — a hint that distinction isn't one people naturally maintain; the distinction that actually matters is "can't reach them yet" (Trying to Reach) vs. "reached them, following up" (Following Up), which §7.2 captures.

### 7.3 Temperature without extra columns
Hot vs. keep-warm is carried by the **next-activity date** already shown on each card (`NEXT · today 2:00 PM` vs `NEXT · Sep 2`), not by a stage. A lead's temperature changes constantly, so encoding it as a date (that reps set anyway) beats a column they must remember to drag. "Ready to book this week" is a **saved view / KPI** (next step within N days), not a column.

### 7.4 Naming trap to avoid
WOW OS's Funnel has a stage named **Qualified**, meaning *post-booking, pre-visit* contact to qualify the job before the estimator arrives. It is not redundant with any WOW Leads stage — it lives on the far side of the booking seam. Do not reuse the word "qualified" for a Leads stage (the old "Engaged = qualified interest" subtitle caused exactly this confusion).

### 7.5 Views
Board (Kanban) as the default working view; List/table for bulk work and owner review; "My leads" vs "All leads" scoping via Switch Franchise.

---

## 8. Key flows

**8.1 Capture → assignment.** A lead enters (web form, inbound call, referral, import, or an outbound prospect who responds), lands in New Lead with a source and an owner, the speed-to-lead clock starts, and a first next-best-action is required before it counts as handled.

**8.2 Working a lead to a booked estimate.** The owner (rep today, agent later) works the next-action queue, logging structured outcomes and advancing states. The tool always answers "who/what is next and why."

**8.3 The handoff — booking (critical flow).** Booking converts the lead to Estimate Booked and creates the Funnel deal in **Estimate Scheduled** with the full record attached, no re-entry. Prototype this first — it's the reason to build inside WOW OS.

**8.4 Outbound prospecting.** Build/import a prospect list, work it on a cadence; a responder flows into the main pipeline as Following Up with source = outbound. (Open question: manual lists vs. assisted sequences.)

**8.5 Owner review.** A franchise-scoped view of pipeline by stage, conversion to booked estimate, speed-to-lead, activity (and, later, AI performance/escalations), aging/stale leads, and location comparison (§9).

**8.6 Escalation (AI-ready seam).** Any lead can be handed up to a human or down to an agent, with provenance preserved. Present even while humans do everything.

---

## 9. Reporting, accountability & training signal

Out of the box: **conversion to booked estimate** (by rep, source, location); **speed-to-lead**; **stage conversion / drop-off** (with lost reasons); **activity** (touches, and leads with no next step); **aging.** As AI comes online, add **% handled autonomously, escalation rate, time-to-book, conversation quality/confidence, cost per booked estimate.** The same labeled outcomes double as training signal for the agent. Track lead-level dollar value only if it will be maintained. Surface "no next step" and "aging past threshold" as first-class red alerts (§10), not buried rows.

---

## 10. Design & UX — consistency with WOW OS

WOW Leads must read as another native area of WOW OS. Reuse existing components; do not recreate them. Derived from the Funnel screenshot (Appendix B).

### 10.1 Visual language
- **Dark theme.** Near-black charcoal canvas; cards one step lighter with subtle 1px borders and rounded corners.
- **Single accent — WOW lime green,** used sparingly for the logo, primary buttons, active nav, and positive/headline values. Green always means "primary action / positive."
- **Typography.** White primary text, muted grey secondary/labels, **uppercase micro-labels** for tags/statuses (`RESIDENTIAL`, `INT`, `WEB FORM`).
- **Semantic color is load-bearing.** Green = on-track/upcoming; red/coral = overdue or needs attention; grey = neutral. Match exactly.
- **Buttons.** One filled-green, rounded, icon-led primary action per card; secondary/rare actions in the top-right `⋮` menu.
- **Tags.** Neutral grey category pill (`RESIDENTIAL`/`COMMERCIAL`) + job-type pill (`INT`/`EXT`) + source pill (`WEB FORM`/`REFERRAL`/`PHONE`/`OUTBOUND`).
- **People/provenance.** Circular initials chip + name for the owner. When an agent owns/performs an action, show an agent marker in the same slot so human vs AI is visible at a glance (supports §3 provenance).

### 10.2 Layout & IA
- **Left sidebar nav.** Add **WOW Leads** as a top-level item directly **above "Funnel"** (leads precede deals), same icon set. Reuse the `+ Add …` pattern (here `+ Add Lead` — and the repointed capture per §4.1), global **Search**, and the **Switch Franchise / user / Sign Out** footer.
- **Page header.** Title top-left, **Board / List** segmented toggle top-right — identical to Funnel.
- **KPI stat cards.** Reuse the three-card header row, retargeted: e.g. *New (uncontacted)*, *Speed-to-lead (avg)*, *Booked this week* — same icon + info-tooltip, headline number in green.
- **Filters.** Two dropdowns mirroring `All Stages` / `All Estimators` → `All Stages` / `All Reps`.

### 10.3 Key screens
1. **Leads board** — mirrors the Funnel board. Columns = §7.2 stages (New Lead · Trying to Reach · Following Up · Estimate Booked; Lost accessible), each with a count badge, filter icon, and Sort-by control. Cards show: name; category + source tags; the **NEXT block** (reusing the appointment-block component — green upcoming, red overdue; this is the human/AI shared control point); owner/agent chip; a stale-time indicator (red when stale); and one green primary action reflecting the next best step (`Log Call`, `Send Text`, `Book Estimate`).
2. **Lead detail** *(inferred — needs a WOW OS record screenshot to finalize)* — contact/address, source, a structured **activity timeline** with provenance, the required next-best-action, and a prominent green **Book Estimate** action. AI-assist affordances live here (draft message, summarize history, suggest next step).
3. **The handoff** — `Book Estimate` converts the lead and lands it in the Funnel at **Estimate Scheduled** (§4, §8.3); same visual system both sides so the seam is invisible.
4. **Oversight / owner view** — KPI cards + charts in the same styling; aging/overdue in red; as AI comes online this becomes the primary human surface (§3 future state) alongside an **exception/escalation queue**.

### 10.4 Consistency rules
Reuse the appointment-block for "NEXT"; reuse card anatomy, count badges, sort controls, filter dropdowns, and the Board/List toggle as-is; one green primary action per card, rest in `⋮`; all data/reporting respect Switch Franchise; match the "status + relative time, red when stale" aging pattern.

---

## 11. Open questions

1. **External Funnel feeds** — does anything enter the Funnel without a human (booking widget, import, partner feed)? If so, route to lead capture (§4).
2. **Existing lead data** — is there anything to migrate in (spreadsheets, inboxes, an ad-hoc board), or does WOW Leads start clean?
3. **Where capture starts** — is CSR/front-desk intake in v1, or does WOW Leads start once a lead exists?
4. **Middle-stage name** — "Following Up" vs "Working" vs keep "Nurturing"? (§7.2)
5. **Outbound depth** — manual prospect lists vs. assisted sequences/cadence in v1?
6. **Assignment rules** — round-robin, territory/service-area, or manual? (Same mechanism will later route between humans and agents.)
7. **Multi-location / corporate view** — v1 or later?
8. **Lead value** — track dollar value at the lead stage at all, given it's unused in Pipedrive today?
9. **Record-page pattern** — need a WOW OS detail/record screenshot to finalize §10.3 #2.
10. **AI phasing** — which touchpoint gets automated first, and what confidence bar triggers escalation to a human?

---

## 12. Success criteria

- A booked estimate lands as a Funnel deal in Estimate Scheduled carrying 100% of the lead's context, no re-keying.
- One record per prospect, always — never a synced Lead + Deal pair.
- Every active lead has a defined next-best-action; owners see the exceptions at a glance.
- Owners answer conversion, speed-to-lead, and activity questions without exporting data.
- Outbound prospecting is visible in the same place as inbound.
- Every human action is expressible as a structured operation with provenance (AI-ready).
- WOW Leads is visually indistinguishable from the rest of WOW OS.

---

## Appendix A — Inspiration reference: an example lead board (Pipedrive)

Shown only as a familiar illustration of the pipeline concept — not a tool we run and not the thing being replaced.

| Stage | Deals (example) | Meaning |
|---|---|---|
| New Lead | 22 | Captured, not contacted |
| Contact Made | 11 | First contact made |
| Engaged | 0 | (empty — dropped; see §7.2) |
| Nurturing | 8 | Interested, not ready |
| Won | 29 | **Estimate booked** |
| Lost | 12 | Not interested / unqualified |

Note the empty "Engaged" column and the concept of Won = estimate booked, both of which informed §7.

## Appendix B — Reference: WOW OS Funnel (design system + downstream funnel)

**Funnel stages (downstream of WOW Leads):** New Deal → Estimate Scheduled → Qualified → Proposal Presented → Proposal Accepted. (Per §4.1, "New Deal" is absorbed into WOW Leads capture; per §7.4, "Qualified" here is post-booking pre-visit contact.)

**Header KPIs:** Sales Pipeline ($2,034,739.36, green) · Active Sales (283) · Active Projects (16).

**Observed components:** dark theme + lime-green accent; left sidebar (logo, `+ Add Deal`, nav Dashboard/Funnel/Customers/Calendar/Tasks/Technicians, Switch Franchise + user footer); global search; Board/List toggle; three KPI cards with info tooltips; `All Stages`/`All Estimators` filters; Kanban columns with count badges, filter icons, Sort-by controls; deal cards with name, `RESIDENTIAL`/`COMMERCIAL` + `INT`/`EXT` tags, green/red appointment blocks, green-outlined money pills with `DRAFT`/`SENT`/`VIEWED`/accepted states, owner initials chips, "Status Updated" relative time (red when stale), a single green primary action, and a `⋮` overflow menu.

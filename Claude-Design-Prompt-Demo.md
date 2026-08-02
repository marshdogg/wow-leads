# Prompt for Claude — WOW Leads feature demo

Attach: `WOW-Leads-Demo-Spec.md`, `WOW-Leads-Design-Doc.md` (PRD), the **WOW OS Funnel** screenshot, and the current **WOW Leads board** mockup. Then paste everything below the line.

---

You're designing a **feature demo for WOW Leads** — a lead, prospecting and re-marketing engine built into WOW OS, our operating system for WOW 1 DAY PAINTING franchises. We have no dedicated tool for this today. I'm attaching a demo spec, a PRD, and two screenshots: the existing **WOW OS Funnel** (our visual system + the downstream sales funnel) and an early WOW Leads board mockup.

Read `WOW-Leads-Demo-Spec.md` first — **it is the source of truth for scope.** Use the PRD only for architecture (§3 human-first/AI-ready), the handoff seam (§4), and the visual system (§10); the PRD's stage set and flat data model are superseded by the demo spec (there's a note at its top). This demo is meant to be ambitious — it should read as a platform, not a single board.

Also note: the attached WOW Leads board mockup predates this feedback — treat it as a visual-style reference, not as the target structure.

## The core idea
There is **no single pipeline**. WOW Leads runs four distinct sales motions, each with its own stages: **Residential Re-marketing** (fast — past customers for referrals/repeat work, plus reviving lost deals), **Commercial Bid** (slow — GC/property-manager bids with takeoffs and negotiation), **Biz Dev/Prospecting** (pre-sales outreach), and **Industry Partner** (a relationship pipeline for RE agents, flooring companies who refer us work). A pipeline switcher makes all four visible; the demo goes deep on Residential Re-marketing.

Underneath sit two things that make it work: a real data model that separates **Contacts** (people) from **Accounts** (companies/properties), and an **automation engine** — trigger-based re-marketing plus AI that drafts outreach and structures field notes, with a human approving.

## Hero narrative to design for
Design the screens so this story can be walked end-to-end:
1. A past customer finished a job 11 months ago — nobody would ever have called them.
2. The **11-Month Touchpoint** trigger fires. AI drafts the warranty-inspection outreach and it lands in the rep's queue for approval.
3. The rep taps approve. Later, from the field, they log the call by **voice** — AI structures the note into outcome + next step.
4. It converts to repeat work, books an estimate, and hands off to the WOW OS Funnel at **Estimate Scheduled** with full history attached.
5. The manager dashboard shows the leaderboard, pipeline health, and a **neglected-deals alert** catching what slipped.
6. Flip the pipeline switcher through Commercial, Biz Dev, and Partner to prove the platform.

## Screens to deliver
1. **Residential Re-marketing board** (hero) — pipeline switcher; referral, repeat-work and revival tracks; AI-suggested touchpoints awaiting approval; source + account-tag pills; one-tap actions on every card.
2. **AI touchpoint approval** — the 11-month trigger: the drafted message, *why it fired*, and Approve / Edit / Skip.
3. **Mobile field view** — one-tap `Log Call`, and voice-to-text note capture with AI structuring it into fields. Mobile is a primary surface, not responsive polish.
4. **Contact / Account record** — an Account with several Contacts; account tags (`GENERAL CONTRACTOR`, `PROPERTY MANAGER`, `HOA BOARD`, `DIRECT HOMEOWNER`, `FACILITY MANAGER`, `INDUSTRY PARTNER`); property details (type, square footage, preferred paint brands/colors, **access notes / gate codes**); preferred contact method; lead source; **assigned-by** (self-sourced vs. handed over, e.g. "SH → Matt"); and an activity timeline showing **provenance** — which human or which agent did each touch.
5. **Commercial Bid board** — Prospecting/Outreach → Bid Invited → Plan Review/Takeoff → Bid Submitted → Negotiation → Won/Lost/**On-Hold**, with bid values and decision dates. On-Hold is first-class, not failure.
6. **Biz Dev + Industry Partner boards** — Biz Dev: Initial Contact (type + date visible) → Follow-up In Progress → First Meeting, sortable by industry, assigned-by visible, showing multi-touch **sequence progress** (Day 1 email → Day 3 call → Day 7 packet → Day 10 follow-up). Partner: a scoreboard per partner — referrals sent, revenue attributed.
7. **Manager dashboard** — Activity Leaderboard (calls, site visits, proposals sent, new contacts this week, by rep); Pipeline Health (active bid value per rep, win rate %, avg deal size); **Neglected Deals Alert** (no logged activity in 14+ days — red and unmissable); source→revenue ROI by channel; % contacts in progress; avg time between touchpoints.
8. **The handoff** — booking an estimate creates the WOW OS Funnel deal at Estimate Scheduled, card shows "Linked in WOW OS." The seam should feel invisible.

## Design constraints
- **Visually indistinguishable from WOW OS.** Same dark theme, single lime-green accent, card anatomy, tags, count badges, sort controls, filter dropdowns, Board/List toggle, sidebar, global search, Switch Franchise footer. Reuse components; don't invent variants.
- **Semantic color is load-bearing:** green = on-track/primary/positive, red/coral = overdue or needs attention, grey = neutral. No new accent colors.
- **Zero-friction logging is the adoption thesis.** If a rep needs five clicks and three required fields, they won't log anything. One tap, no required fields, voice as a first-class input. Let this shape every card.
- **Human-first, AI-ready.** AI drafts and suggests; a human approves. Show the approval moment explicitly. Every action must read as a discrete operation an agent could also perform, with provenance visible.
- **One green primary action per card**, everything else in the `⋮` overflow.
- Where you infer something not visible in the screenshots, flag it.

## Deliver
The screens above, a short rationale for any divergence from the spec, and a list of what you need from me to finalize. Include realistic sample data — an overdue touchpoint in red, an agent-owned card, a partner-sourced referral, and a commercial bid on hold.

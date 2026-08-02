# WOW Leads — Feature Demo Spec ("go big")

Owner: Marshall · WOW 1 DAY PAINTING · July 31, 2026
Companion to: `WOW-Leads-Design-Doc.md` (PRD) · `Claude-Design-Prompt-Demo.md` (design hand-off)

---

## 0. What the feedback changed

The stakeholder feedback redefines the scope. This is no longer a lead board — it's a **multi-pipeline revenue engine** with four distinct sales motions, a real B2B+B2C data model, and an automation layer. The demo should read as a platform, with one hero flow taken all the way to the floor.

Three pillars organize everything:

| Pillar | What it is |
|---|---|
| **1. Foundation** | Contacts vs. Accounts, tags, property details, source, assigned-by |
| **2. Pipelines** | Four motions, each with its own stages (not one shared pipeline) |
| **3. Engine** | Frictionless capture, automation/sequences/triggers, manager oversight |

---

## 1. Pillar 1 — Foundation: the data model

**Separate Contacts from Accounts.** A Contact is a person; an Account is a company or property. One Account has many Contacts; one Contact can touch many Accounts (a GC across three sites).

**Account tags** (filterable, drive pipeline routing): `GENERAL CONTRACTOR` · `PROPERTY MANAGER` · `HOA BOARD` · `DIRECT HOMEOWNER` · `FACILITY MANAGER` · `INDUSTRY PARTNER`

**Property detail fields:** property type (Interior / Exterior / Industrial), square footage, preferred paint brands & colors used, **access notes** (gate codes, staging areas), last job date + job value.

**Contact fields:** name, role, **preferred contact method** (SMS / email / phone — drives which action the card offers), business type (filterable for both prospecting *and* sales reporting), free-form notes (personality/relationship intel), lead source, **assigned by** (self-sourced vs. handed over — e.g. "SH → Matt").

**Lead source** is required on every record: Google Ads · Yard Sign · Cold Call · GC Referral · Door Hanger · Web Form · Past Customer · Partner Referral. Powers true ROI-per-channel.

**Provenance** on every activity: which human or which agent did it (carried from PRD §3).

---

## 2. Pillar 2 — Four pipelines, four stage sets

A pipeline switcher at the top of the board. Each motion has its own stages, cadence, and card anatomy.

### 2.1 Residential Re-marketing — *fast* (HERO)
Mines the highest-margin work: past customers and dead leads.

Two tracks, same rhythm:
- **Referral track:** Past Customer → Followed up for referral → 2nd follow-up → Promo offered → Followed up → **Result**
- **Repeat-work track:** Past Customer → Followed up for repeat work → 2nd follow-up → Promo offered → Followed up → **Result**
- **Revival track:** lost/cancelled prospects re-entered after a cooling period

Must *feel* fast: short cadences, one-tap actions, quick resolution.

### 2.2 Commercial Bid — *slow*
Prospecting/Outreach → Bid Invited → Plan Review/Takeoff → Bid Submitted → Negotiation → **Won / Lost / On-Hold**

Long lead times. Cards carry bid value, decision date, GC/PM account, takeoff status. **On-Hold** is a first-class state, not a failure.

### 2.3 Biz Dev / Prospecting — *pre-sales*
Initial Contact Made (with type + date visible) → Follow-up In Progress → First Meeting → *(hands to Commercial or Residential)*

Sortable by date, industry, business type. **Assigned-by** label visible on every card.

### 2.4 Industry Partner / Referral Network — *relationship*
RE agents, flooring companies, realtors — they *send* you business. This is a relationship pipeline, not a deal pipeline: Identified → Introduced → Active Referrer → Dormant, with **referrals-sent** and **revenue-attributed** as the scoreboard per partner.

---

## 3. Pillar 3 — The engine

### 3.1 Frictionless capture (adoption or death)
"If reps have to click five times and fill three text boxes, they won't do it."

- **One-tap Log Call / Log Text / Log Visit** — single tap, no required fields.
- **Voice-to-text notes** — mic icon; SC talks after walking a site, AI structures it into fields (outcome, next step, scope notes).
- **Mobile-first** — the field view is a primary design target, not a responsive afterthought.
- **Auto email + calendar sync** — sent emails, site visits, bid follow-ups logged with zero manual entry.
- **North star:** all calls, SMS, and email eventually flow *through* the CRM, so logging disappears entirely.

### 3.2 Automation — sequences & triggers
**Prospecting sequences** (multi-touch, auto-generated tasks): Day 1 intro email → Day 3 phone call → Day 7 drop off info packet → Day 10 follow-up email.

**Trigger-based re-marketing:**
- **11-Month Touchpoint** — 11 months post-completion: "Your 1-year warranty inspection is coming up — great time to touch up high-traffic interior zones."
- **Seasonal campaigns** — spring exterior wash/repaint to past residential; late-fall end-of-year budget push to commercial.
- **Lost-Lead Revival** — deals marked *Lost – Price Too High* auto re-engage at 6 months (competitor quality? new budget?).

AI drafts every message; a human approves. Assistive now, autonomous later.

### 3.3 Manager oversight dashboards
Track **inputs** (effort) and **outputs** (revenue) so managers stop micro-managing:

- **Activity Leaderboard** — calls made, site visits completed, proposals sent, new contacts added, this week, by rep.
- **Pipeline Health** — total active bid value per rep, win rate %, average deal size.
- **Neglected Deals Alert** — auto view of any active prospect or bid with **no logged activity in 14+ days**. Red, unmissable.
- **Prospecting metrics** — % of contacts in progress, **average time between touchpoints**, source→revenue ROI by channel.

---

## 4. Demo strategy

**Go big on the shape, deep on one flow.** The demo must read as a platform (all four pipelines present and switchable, real data model) while taking **Residential Re-marketing + AI automation** all the way down. Why that hero: highest-margin work, uniquely WOW (11-month warranty touch is not in any generic CRM), fast cadences resolve on screen, and it's the cleanest showcase of human-first/AI-ready.

**The narrative to demo, in order:**
1. *The problem* — a past customer finished a job 11 months ago and nobody would ever have called them.
2. *The trigger fires* — AI creates the touchpoint, drafts the message, and it appears in the rep's queue awaiting approval.
3. *One tap* — rep approves; later logs the call by voice, AI structures the note.
4. *It converts* — becomes a repeat-work lead, books an estimate, hands to the WOW OS Funnel at Estimate Scheduled.
5. *The manager view* — leaderboard, pipeline health, and the neglected-deals alert catching what slipped.
6. *The switcher* — flip to Commercial, Biz Dev, and Partner pipelines to show the platform is real.

**Faked vs. real in the demo:** all four pipelines rendered with realistic data (real); hero automation flow interactive end-to-end (real); commercial takeoff/plan review, email sync internals, and actual message sending (visually represented, not functional).

---

## 5. Screens to build

1. **Residential Re-marketing board** (hero) — pipeline switcher, referral + repeat + revival tracks, AI-suggested touchpoints awaiting approval, source & tag pills, one-tap actions.
2. **AI touchpoint approval** — the 11-month trigger: drafted message, why it fired, Approve / Edit / Skip.
3. **Mobile field view** — one-tap Log Call and the voice-to-text note capture with AI structuring it.
4. **Contact / Account record** — Account with multiple Contacts, tags, property details (sq ft, brands/colors, gate codes), activity timeline with provenance, assigned-by, source.
5. **Commercial Bid board** — the long-cycle pipeline with bid values, On-Hold, takeoff status.
6. **Biz Dev + Partner boards** — prospecting sequence progress; partner scoreboard (referrals sent, revenue attributed).
7. **Manager dashboard** — activity leaderboard, pipeline health, **neglected-deals alert**, source ROI.
8. **The handoff** — booking an estimate creates the WOW OS Funnel deal at Estimate Scheduled with full history.

All screens reuse the WOW OS visual system (dark theme, single lime-green accent, semantic green/red, card anatomy, tags, sidebar, Switch Franchise) per PRD §10.

---

## 6. What this changes in the PRD

- **Stages are per-pipeline, not global.** PRD §7's single stage set becomes the *default residential-inbound* pipeline; add the four motions above.
- **Data model expands** from a flat Lead to **Account + Contact + Deal**, with tags, property fields, source, and assigned-by.
- **The engine becomes a first-class pillar** — capture friction, sequences/triggers, and dashboards are core scope, not "later."
- **Mobile is a primary surface**, not responsive polish.
- **The AI-ready thesis is now the product**, not a future state: triggers, drafting, and voice structuring are the demo's spine.

---

## 7. Open questions

1. Which promo(s) are offered in the residential re-marketing track — fixed discount, seasonal offer, referral bonus?
2. Does an Industry Partner referral create a lead directly, or a Biz Dev prospect first?
3. Neglected-deals threshold: 14 days across all pipelines, or per-pipeline (commercial cycles are far longer)?
4. Who owns AI-drafted outreach approval — the assigned rep, or a manager for first N sends?
5. Compliance: automated SMS/email consent handling for past customers, by state/province.
6. Does "Result" in the residential tracks resolve to Won/Lost, or into the estimate-booking handoff?

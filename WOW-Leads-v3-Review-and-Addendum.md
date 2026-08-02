# WOW Leads v3 — review of the design handoff + addendum

Reviewed: `WOW Leads v3.dc.html` handoff README (Claude design)
Author: Marshall · July 31, 2026
Purpose: gaps to fix before build, plus a new requirement — **user-configurable pipelines and columns**

---

## ✅ STATUS — updated July 31, after CLI triage

The **app is now the source of truth**; the v3 HTML prototype is a dead artifact and is not being carried forward to v4.

Six of the nine findings below were **already built in the app** and need no further work:
2.1 (fifth pipeline + speed-to-lead) · 2.4 (real Account/Contact entities) · 2.5 (`preferredChannel`, business type) · 2.6 (three-way provenance on the timeline) · 2.7 (mobile board + record) · 2.8 (fuller dashboard).

**Three remain, and they are the highest-priority items from Part 4 — now in build:**

| # | Gap | Section |
|---|---|---|
| 1 | **Semantic stage types** (`open / positive / paused / won / lost`) driving all styling, win-rate maths and neglect alerts | 3.2 |
| 2 | **Explicit Won/Lost outcomes** with `lostReason` + `lostAt`, wiring the revival trigger to price + 6 months | 2.2, 2.3 |
| 3 | **Pipeline Settings screen** — rename / reorder / add / archive, ≥1 won + ≥1 lost validation, locked spine stages, delete-migration prompt | 3.3–3.6 |

Everything below is retained as the reasoning record.

---

## Part 1 — What v3 got right

Genuinely strong work; the following should be preserved as-is.

- **Four pipelines with genuinely different stage sets**, not one shared pipeline with a filter. This was the core insight in the feedback and it landed.
- **The hero flow is intact end-to-end** — 11-month trigger → AI draft → human approval → field logging → provenance timeline → Funnel handoff.
- **"WHY THIS FIRED"** on approval cards. This is the trust mechanism that makes AI-drafted outreach acceptable to a rep. Don't cut it.
- **Provenance is real** — `owner.agent`, `assignedBy` ("Trigger → Dani", "Sequence → Jorden"), and a timeline distinguishing human from agent. Exactly what PRD §3 asked for.
- **Amber revival / On-Hold as a distinct semantic tone** — paused ≠ lost ≠ active. Good judgment.
- **Voice-to-structure as the anti-form thesis.** "Speak the outcome, the system structures it" is the right answer to the adoption risk.
- **"Pipeline + stage config as data (not code)"** in workstream 1 — this already anticipates Part 3 below.

---

## Part 2 — Gaps to fix (ordered by severity)

### 2.1 🔴 There is no home for a brand-new inbound residential lead
The Residential pipeline is scoped entirely to **re-marketing** (Past Customer → Followed Up → … → Result). But the source list includes Google Ads, Yard Sign, Web Form, Door Hanger — net-new homeowners who want a quote *now*. No pipeline holds them.

This dropped out because the stakeholder feedback had two passes: the first defined Residential as `New Lead → Estimate Scheduled → Proposal Sent → Follow-up → Won/Lost`; the second redefined it as re-marketing tracks. Both are real motions.

**Fix:** treat these as two separate pipelines (or two tracks with distinct stage sets) — **Residential New Inbound** (speed-to-lead is the metric that matters) and **Residential Re-marketing** (existing v3 design). This also restores the original speed-to-lead KPI, which has disappeared from v3 entirely.

### 2.2 🔴 Commercial has no Won or Lost stage
v3's Commercial stages end: `… → Negotiation → On-Hold`. The feedback said **Won / Lost / On-Hold**. On-Hold has been promoted to terminal column and Won/Lost vanished.

Consequence: the manager dashboard promises **win rate %** and **source → revenue ROI**, both of which are uncomputable without an explicit Won state. Internal contradiction.

**Fix:** every pipeline terminates in explicit outcome stages. On-Hold is a *parallel* paused state, not the end of the board.

### 2.3 🔴 Lost reasons were dropped — which breaks the revival trigger
The PRD required a structured lost reason (not interested, unqualified, **price**, timing, competitor, no response). It appears nowhere in v3's data model or screens.

Consequence: the **Lost-Lead Revival** trigger is specified as re-engaging deals marked *"Lost – Price Too High"* after 6 months. Without a structured lost reason there is nothing for that trigger to target. A headline automation is unbuildable as specced.

**Fix:** `lostReason` (enum) + `lostAt` (date) as required fields on any Lost transition. The revival trigger keys off both.

### 2.4 🟠 Accounts and Contacts aren't actually modelled as entities
Pillar 1 of the feedback was separating **Contacts** (people) from **Accounts** (companies/properties). In v3's data model, `account` is a **string** — "address, company, or contact line — the secondary line on the card." That's a display label, not a relation. The Record screen *shows* an account with a contacts list, but nothing in the schema supports it.

Consequence: a GC contact spanning three properties, or a property with three decision-makers, can't be represented. Property fields (sq ft, brands/colors, gate codes) have nowhere to live.

**Fix:** promote to real entities — `Account` (type tag, property details, access notes) ⇄ `Contact` (person, role, **preferred contact method**, business type) ⇄ `Deal` (pipeline, stage, outcome). Many-to-many between Contact and Account.

### 2.5 🟠 Fields from the feedback that are missing
- **Preferred contact method** (SMS / email / phone) — feedback said it should *drive which action the card offers*. v3 has only `quick: boolean` for a fixed Call/Text/Visit row.
- **Business type** as a first-class filterable field — needed "both for prospecting and for sales data." v3 folds it into free-form `tags`.
- **On-Hold revisit date** — described in prose, absent from the schema.
- **Relationship notes** — the feedback explicitly wanted personality/relationship intel on the contact record.

### 2.6 🟠 Auto email + calendar sync is absent from every screen
The feedback's north star: *"eventually all calls, SMS and emails are made through the CRM,"* with sent email, site visits and bid follow-ups logged automatically. v3 shows only manual quick-log and voice. The auto-captured timeline entry — the thing that makes logging disappear — is never depicted.

**Fix:** show at least one auto-logged entry in the Record timeline, visually distinct from manually logged and agent-generated ones.

### 2.7 🟡 Mobile is one screen, not a mode
Feedback said **mobile-first** because SCs live in the field. v3 delivers a single phone-framed Field view for one lead. The board, list, record and quick-log aren't specified at mobile width.

**Fix:** at minimum specify mobile board + record; state explicitly which surfaces are mobile-critical.

### 2.8 🟡 Manager dashboard is under-specified relative to its importance
One line in the README ("Neglected deals, rep leaderboard, pipeline health, source → revenue ROI") versus multiple paragraphs for the board. Missing from the feedback: **% of contacts in progress**, **average time between touchpoints**, and per-pipeline neglect thresholds. Missing from PRD §3: AI oversight metrics (**% handled autonomously, escalation rate, approval-edit rate**) — which the PRD argued become the *primary* human surface over time.

### 2.9 🟡 Speed-to-lead has disappeared
It was the leading indicator in the PRD and is absent from v3's KPIs. Returns naturally with 2.1.

---

## Part 3 — New requirement: user-configurable pipelines & columns

Users must be able to **create new columns, rename and reorder existing ones, and ideally create whole pipelines.** v3 is currently hardcoded in ways that break under this, so this needs designing deliberately.

### 3.1 What breaks in v3 today
v3 hardcodes behaviour to specific stage ids:
- *"Active/positive stages (`result`, `negotiation`, `active`, `meeting`) get a green border"*
- *"On-Hold title is amber; Dormant is dusty"*
- Column `$ in stage` roll-ups are hardcoded to Commercial
- Sorting uses "stage (pipeline order)"; collapse state is keyed `pipeline:stage`
- Triggers and sequences reference stages implicitly

If a user renames "Result" or adds "Awaiting Permit," none of this styling, reporting or automation knows what to do.

### 3.2 The core mechanism: semantic stage types
Don't let styling or reporting key off a stage's **id or name**. Key off a **semantic type** the user chooses when creating the column:

| Semantic type | Meaning | Styling | Counts as |
|---|---|---|---|
| `open` | Active work in progress | neutral border | in pipeline |
| `positive` | Late-stage, near close | green border | in pipeline |
| `paused` | Live but on hold (needs revisit date) | amber | in pipeline, excluded from neglect alerts |
| `won` | Closed successfully | green solid | numerator of win rate |
| `lost` | Closed unsuccessfully (requires lost reason) | dusty/red | denominator of win rate |

This is what makes configurability safe: a user can invent "Awaiting Permit" and tag it `paused`, and the dashboards, neglect alerts, win-rate math and card styling all keep working with zero code changes.

### 3.3 Stage as a configurable entity
```
Stage {
  id            stable, machine-generated — never changes on rename
  pipelineId
  label         user-editable display name
  hint          the 11px helper line under the column title
  order         integer, drag to reorder
  semanticType  open | positive | paused | won | lost
  accent        optional colour override (from a constrained palette)
  showValueRoll bool — display "$X in stage" total
  requiresReason bool — force structured reason on entry (default true for lost)
  neglectDays   optional per-stage override of the 14-day threshold
  isDefault     landing column for new deals in this pipeline
}
```

### 3.4 Editing behaviours & guardrails
- **Rename** — always safe. `id` is stable, so history, triggers and reports follow automatically.
- **Reorder** — drag columns; order is data, not code.
- **Add** — user picks label + semantic type; inherits styling from the type.
- **Delete** — blocked while deals occupy it. Force a choice: *move deals to \_\_\_* or *archive*. Never orphan deals.
- **Archive not delete** — historical deals must still render their old stage in the audit timeline even after a stage is retired. Stage records are immutable history; only their `active` flag changes.
- **Validation** — every pipeline requires at least one `won` and one `lost` stage. This is what protects reporting integrity (and would have caught gap 2.2).
- **Trigger safety** — automation rules reference stage `id`. On delete/archive, warn: *"3 automations reference this stage."* Never silently break a trigger.
- **Custom pipelines** — allow creating a pipeline from scratch or by cloning an existing one. Cloning is the common path.

### 3.5 The hard tension: configurability vs. cross-location reporting
If every franchise invents its own stages, corporate roll-up reporting dies — you can't compare win rates across locations whose boards don't align.

**Recommendation: a locked spine, configurable within it.**
- **Corporate** defines each pipeline's required semantic spine (must have: an entry stage, at least one `won`, one `lost`).
- **Franchise owners** may add, rename and reorder stages *within* that spine.
- **All roll-up reporting aggregates by `semanticType`, never by label.** So "Bid Submitted" in one market and "Quote Out" in another both roll up as `open` and remain comparable.
- Locked stages render with a small lock affordance and an explanatory tooltip.

Open decision for you: is stage editing a **franchise-owner** permission or **corporate-only**? Recommend owner-editable within a corporate spine, since that's what makes the tool feel like theirs without sacrificing the reporting goal.

### 3.6 Screen to add
**Pipeline settings / editor** — list of pipelines; select one to see its stages as reorderable rows (label, hint, semantic type, value-roll toggle, neglect override, lock state). Add-stage inline. Delete with the migration prompt from 3.4. Live preview of the resulting board.

---

## Part 4 — Priority for the demo

If time is short, fix in this order:

1. **2.2 + 2.3** (Won/Lost + lost reasons) — small effort, and without them the dashboard and revival trigger are provably broken.
2. **2.1** (new-inbound residential pipeline) — restores the highest-volume motion and speed-to-lead.
3. **3.2 + 3.6** (semantic stage types + pipeline editor) — the configurability ask; the semantic-type mechanism is the whole trick.
4. **2.4** (Account/Contact as real entities) — schema work, mostly invisible in the demo but blocks everything after it.
5. **2.6 + 2.8** (one auto-logged timeline entry; flesh out the dashboard).

---

## Part 5 — Open questions carried forward

From v3's README, still unresolved: which promos exist and who authors them; whether Residential **Result** resolves to Won/Lost or straight to booking (answered by 2.2 — make it explicit); per-pipeline neglect thresholds (now supported by `neglectDays` in 3.3); and the Record screen field set, which still needs a real WOW OS deal-detail screenshot.

New: is stage editing an owner or corporate permission (3.5)? And does a partner referral create a Deal directly, or a Biz Dev prospect first?

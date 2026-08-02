# CLI prompt — WOW Leads v3 → v4

Run from the directory containing `WOW Leads v3.dc.html`, `support.js`, and `README.md`.
Also place `WOW-Leads-v3-Review-and-Addendum.md` in that directory first.

---

Read these files before changing anything:

- `README.md` — the v3 design handoff (data model, screens, tokens, state)
- `WOW Leads v3.dc.html` — the working prototype
- `WOW-Leads-v3-Review-and-Addendum.md` — a review of v3 listing defects to fix and one new requirement

Your job: produce **v4** of the prototype by fixing the defects in Parts 2–3 of the addendum and adding user-configurable pipelines. Work in a copy named `WOW Leads v4.dc.html`; leave v3 untouched. Update `README.md` to describe v4 (keep its structure — data model, screens, interactions, state, tokens).

**Preserve exactly:** the existing visual language and design tokens, the four-pipeline structure, the 11-month trigger → AI draft → approval → field-log → provenance → Funnel-handoff hero flow, the "WHY THIS FIRED" reasoning panel, drag-and-drop, collapse, list sorting, and the restrained motion. This is a surgical extension, not a redesign.

## Work in this order

### 1. Outcome model (addendum 2.2, 2.3)
Every pipeline must terminate in explicit outcome stages. Commercial currently ends `Negotiation → On-Hold`, which makes the dashboard's win-rate metric uncomputable.

- Add `Won` and `Lost` stages to Commercial. **On-Hold becomes a parallel paused state, not the terminal column** — give it a `revisitDate`.
- Resolve Residential `Result` into explicit `Won` / `Lost` outcomes.
- Add `lostReason` (enum: not interested, unqualified, price, timing, competitor, no response, other) and `lostAt` to the deal model. Entering any `lost` stage requires a reason — show that prompt in the UI.
- Wire the **Lost-Lead Revival** trigger to key off `lostReason === 'price'` and `lostAt + 6 months`. It currently has nothing to target.

### 2. Residential New Inbound pipeline (addendum 2.1)
There is no home for a net-new homeowner from Google Ads / Yard Sign / Web Form. Add a fifth pipeline, **Residential New Inbound**: `New Lead → Contacted → Estimate Booked → Won / Lost`, with **speed-to-lead** (time from creation to first contact) as its headline KPI, shown on the card and in the KPI strip. Keep the existing re-marketing pipeline as-is.

### 3. Configurable stages — the core of this release (addendum 3.1–3.6)
Stop keying styling, reporting or automation off stage ids or labels. v3 hardcodes *"stages `result`, `negotiation`, `active`, `meeting` get a green border"* — remove that pattern entirely.

Introduce a **semantic type** per stage: `open | positive | paused | won | lost`. All card/column styling, win-rate math, and neglect alerts derive from the semantic type, so a user-invented stage styles and reports correctly with no code change.

Make stages configurable data:

```
Stage { id (stable, never changes on rename), pipelineId, label, hint, order,
        semanticType, accent?, showValueRoll, requiresReason, neglectDays?, isDefault, locked, active }
```

Behaviours and guardrails:
- **Rename** — safe; `id` is stable so history, triggers and reports follow.
- **Reorder** — drag rows; order is data.
- **Add** — user supplies label + semantic type; styling inherits from the type.
- **Delete** — blocked while deals occupy the stage. Force *move deals to \_\_\_* or *archive*. Never orphan a deal.
- **Archive, don't delete** — retired stages must still render in historical audit timelines (`active: false`).
- **Validate** — every pipeline requires ≥1 `won` and ≥1 `lost` stage. Block saves that violate this.
- **Trigger safety** — automations reference stage `id`; on archive/delete warn *"N automations reference this stage."*
- **Locked stages** — corporate-defined spine stages render with a lock affordance and tooltip; franchise users can add/rename/reorder around them but not remove them.
- Allow **creating a new pipeline**, from scratch or by cloning an existing one.

Add a **Pipeline Settings** screen (new nav item + `view: 'settings'`): pipeline list → selected pipeline's stages as reorderable rows exposing label, hint, semantic type, value-roll toggle, neglect override, lock state; inline add-stage; delete with the migration prompt; and a live preview of the resulting board.

All roll-up reporting must aggregate by `semanticType`, never by label — so "Bid Submitted" and "Quote Out" in different markets stay comparable.

### 4. Accounts & Contacts as real entities (addendum 2.4, 2.5)
`account` is currently a display string. Promote to entities: `Account` (type tag, property type, square footage, preferred brands/colours, access notes, last job date/value) ⇄ `Contact` (name, role, **preferredChannel** `sms|email|phone`, businessType, relationship notes) ⇄ `Deal`. Contact↔Account is many-to-many so a GC spans multiple properties. Deal references both.

`preferredChannel` drives which quick-log action the card surfaces first. `businessType` becomes a first-class filter on board and list.

### 5. Auto-capture + dashboard (addendum 2.6, 2.8, 2.9)
- In the Record timeline, show at least one **auto-logged** entry (synced email / calendar site visit), visually distinct from manually logged and agent-generated entries — three provenance styles total.
- Flesh out the Manager dashboard: keep neglected deals, leaderboard, pipeline health and source→revenue ROI; add **% of contacts in progress**, **average time between touchpoints**, **speed-to-lead**, and AI-oversight metrics (**% handled autonomously, escalation rate, approval-edit rate**). Neglect thresholds respect each stage's `neglectDays`, and `paused` stages are excluded from neglect alerts.

### 6. Mobile (addendum 2.7)
Specify and implement mobile widths for the **board** and **record** screens, not just the existing single Field view. Note in the README which surfaces are mobile-critical.

## Constraints
- Single self-contained HTML file plus the existing `support.js`; same declarative-template + state-class architecture as v3.
- No new colour ramps. Reuse the token set in the README; `paused` uses the existing amber, `lost` the existing dusty/red.
- Realistic fixture data across all five pipelines, including: an overdue next-action, an agent-owned card, a partner-sourced referral, a commercial bid on hold with a revisit date, a lost-on-price deal eligible for revival, and a new-inbound lead with a live speed-to-lead clock.
- Keep prototype state client-side, but note in the README which state belongs server-side in production.

## Deliver
1. `WOW Leads v4.dc.html`
2. Updated `README.md` covering the new stage-config model, the fifth pipeline, the Account/Contact schema, and the Settings screen
3. A short `CHANGELOG-v4.md` mapping each change to its addendum item, and listing anything you couldn't resolve

Flag any inference you make that isn't grounded in the addendum or README rather than guessing silently.

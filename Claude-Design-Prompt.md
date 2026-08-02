# Prompt for Claude — update the WOW Leads design

Copy everything below the line into Claude design. Attach three things: this PRD (`WOW-Leads-Design-Doc.md`), the **WOW OS Funnel** screenshot, and the current **WOW Leads board** mockup.

---

You're helping me design **WOW Leads**, a lead & prospecting tool built into WOW OS (our operating system for WOW 1 DAY PAINTING franchises). I'm attaching a PRD and two screenshots: the existing **WOW OS Funnel** (our visual system + the downstream sales funnel) and an earlier **WOW Leads board** mockup that needs updating. Read the PRD first — especially §3 (architecture), §4 (capture model + seam), §7 (pipeline), and §10 (design). Ask me anything ambiguous before you start.

## What to design
Update the WOW Leads board mockup to match the model in the PRD, and produce the two supporting screens. Keep it visually indistinguishable from the WOW OS Funnel — same dark theme, single lime-green accent, card anatomy, tags, count badges, sort controls, filter dropdowns, Board/List toggle, sidebar, and search. Reuse components; don't invent variants.

## Key changes from the current mockup
1. **New stage set** — the board columns are now: **New Lead → Trying to Reach → Following Up → Estimate Booked**, plus **Lost** (accessible, not a primary column). Drop "Contact Made" and "Engaged" as columns — those are events, not resting states (PRD §7.2). Column subtitles: New Lead = "captured, needs first contact"; Trying to Reach = "reached out, no response yet"; Following Up = "connected, not booked yet"; Estimate Booked = "appointment set → exits to WOW OS".
2. **Single capture** — the primary action is `+ Add Lead` (top of sidebar), and it's the *only* front door for a prospect. There is no separate "New Deal" capture. Show that a lead only becomes a WOW OS Funnel deal at booking.
3. **The NEXT block is the hero of every card** — reuse the Funnel's appointment-block component: green when the next step is upcoming, red when overdue. It carries the lead's urgency/temperature (so we don't need hot/cold columns). Each card shows one green primary action reflecting the next best step (`Log Call`, `Send Text`, `Book Estimate`).
4. **Provenance / AI-ready** — the owner chip should be able to show either a person (initials) *or* an agent, so it's clear at a glance whether a human or AI performed the last action / owns the next step. Design this slot now even though humans do everything today.
5. **The handoff** — design the `Book Estimate` moment: converting a lead visibly creates a WOW OS Funnel deal at "Estimate Scheduled" with the lead's full history attached. The card should show it's now "Linked in WOW OS." The seam should feel invisible — same visual language both sides.

## Screens to deliver
1. **Leads board** (updated per above) — with realistic cards across all stages, including examples of overdue NEXT (red), an agent-owned card, and an outbound-sourced lead.
2. **Lead detail / record page** — currently only inferred. Design contact/address, source, a structured **activity timeline with provenance** (who/what did each touch), the required next-best-action, and a prominent green `Book Estimate`. Include AI-assist affordances (draft the follow-up message, summarize history, suggest the next step) presented as *suggestions a human approves* — assistive, not autonomous.
3. **Owner oversight view** — reuse the three KPI stat-card pattern retargeted to leads (New/uncontacted, avg Speed-to-lead, Booked this week) plus a simple stage/conversion view. Note in annotations how this becomes the primary human surface as AI takes over touchpoints (PRD §3 future state).

## Constraints & principles
- Human-first, AI-ready (PRD §3): the UI is a view over the model. Every action a human takes must read as a discrete, repeatable operation an agent could also perform.
- Semantic color is load-bearing: green = on-track/primary, red = overdue/attention, grey = neutral. Don't introduce new accent colors.
- Respect Switch Franchise scoping and the existing sidebar/search/footer.
- Where you're inferring something not visible in the screenshots (especially the record page), flag it so I can confirm against real WOW OS screens.

Deliver the screens plus a short rationale for any place you diverged from the current mockup, and list anything you need from me to finalize the record page.

# Handoff: WOW Leads (v3) — multi-pipeline lead & prospecting module for WOW OS

## Overview
WOW Leads is the pre-Funnel half of WOW OS: everything that happens *before* an estimate is booked. It covers four
pipelines (Residential Re-marketing, Commercial Bid, Biz Dev / Prospecting, Industry Partner) on one shared
Account/Contact data model, with AI agents that draft touchpoints on a schedule, humans who approve them, field reps
who log outcomes by voice or one tap, and a hand-off into the existing WOW OS Funnel when a deal becomes an estimate.

The signature flow the prototype demonstrates end to end:
**11-month trigger fires → AI drafts a touchpoint → human approves it in the Approvals queue → rep logs the outcome in
the field (one tap or voice-to-structure) → the Account record shows the full provenance timeline → deal books and
appears in the WOW OS Funnel as "Estimate Scheduled."**

## About the design files
The files in this bundle are **design references authored in HTML** — an interactive prototype of the intended look and
behaviour. They are **not** production code and should not be lifted directly.

- `WOW Leads v3.dc.html` — the full prototype. Open in a browser to click through it.
- `support.js` — the runtime the prototype file needs to render. Not part of the product; ignore for implementation.

The prototype is a single file with a declarative template and a JS class holding all state and derived view-model
values. The implementation task is to **recreate these screens in the WOW OS codebase using its existing framework,
component library, routing, and data layer.** If no environment is chosen yet, pick a conventional React + TypeScript
stack and implement there. The prototype's data (`state.deals`, `PIPES`, `TRACK_STYLE`, `TAG_STYLE`) is realistic
fixture data — use it to seed dev/demo environments and to write tests against.

## Fidelity
**High fidelity.** Colors, type sizes, spacing, radii, and interaction states in this bundle are final-intent. Match
them where the WOW OS design system doesn't already dictate an equivalent token; where it does, prefer the system
token and note the divergence. Layout, information hierarchy, and copy should be reproduced as designed.

---

## Data model

### Deal / Lead
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `pipe` | `resi \| comm \| bizdev \| partner` | which pipeline the lead lives in |
| `track` | `referral \| repeat \| revival` | Residential only; drives the coloured track chip |
| `stage` | stage id | must be a stage of its own pipeline |
| `name` | string | person (residential/bizdev) or project name (commercial) or company (partner) |
| `account` | string | address, company, or contact line — the secondary line on the card |
| `tags` | string[] | account-type + work-type tags, styled by category (see `TAG_STYLE`) |
| `source` | string | Past Customer, Yard Sign, Google Ads, Partner Referral, Cold Call, Web Form, Door Hanger, GC Referral |
| `owner` | `{initials, name, agent: boolean}` | `agent: true` renders the square "AI" chip instead of a round avatar |
| `assignedBy` | string | provenance: "Self-sourced", "Trigger → Dani", "Bright Path RE → Reese", "Sequence → Jorden" |
| `aiPending` | boolean | there is an unapproved AI-drafted touchpoint → pulsing "AI DRAFTED" chip |
| `stale` | string | human last-touch string ("19d silent", "11 mo since job") |
| `staleWarn` | boolean | renders `stale` in the red tone |
| `metrics` | `{label, value}[]` | up to 2, rendered as a split stat strip on the card |
| `seq`, `seqName`, `seqStep` | number / string | Biz Dev sequences — 4-segment progress bar |
| `next` | `{label, due, state: 'ok' \| 'overdue'}` \| null | the next action block; null renders the dashed "Not set / Required" state |
| `act` | string | primary CTA label ("Review draft", "Log Call", "Send Text", "Log Visit", "View in Funnel") |
| `quick` | boolean | show the Call / Text / Visit quick-log row |
| `osRef` | string? | WOW OS estimate id; renders the "Linked in WOW OS · EST-40218" footer |
| `initialType` | string? | Biz Dev: "Cold call · Jul 28" — replaces `stale` in the card footer |

### Pipelines and stages (`PIPES`)
**Residential Re-marketing** (`resi`, dot `#7ed321`, has tracks) —
Past Customer → Followed Up → 2nd Follow-up → Promo Offered → Promo Followed Up → Result

**Commercial Bid** (`comm`, dot `#7fb2e0`) —
Prospecting → Bid Invited → Plan Review / Takeoff → Bid Submitted → Negotiation → On-Hold
*On-Hold is a live state with a revisit date, not a loss.* Column headers in this pipeline show a `$XXXK in stage`
roll-up computed from each card's EST. VALUE / BID metric.

**Biz Dev / Prospecting** (`bizdev`, dot `#b19ad6`) —
Initial Contact Made → Follow-up In Progress → First Meeting
*First Meeting hands the lead off to Commercial or Residential.* Cards carry sequence progress.

**Industry Partner** (`partner`, dot `#e0a52b`) —
Identified → Introduced → Active Referrer → Dormant
*Not a deal pipeline — a relationship one.* Card metrics are REFERRALS SENT and ATTRIBUTED revenue; Dormant = no
referral in 90+ days.

### Tracks (Residential only)
`All tracks | Referral | Repeat work | Revival`. Referral and Repeat use the green chip style; **Revival is amber**
(`#2b2413 / #d8b45e / #4a3a17`) — a paused-not-dead state, deliberately distinct from active green and from lost.

---

## Screens

### 1. Board (default view)
Left rail (252px, `#0a0c0a`, 1px right border `#1f231e`): avatar, org, nav list, footer with location switcher.

Main column:
1. **Pipeline selector** — 4 cards in a wrapping row, each 196px min-width, 11px radius, 11px/16px padding, showing a
   coloured dot, label, and a meta line. Selected: border `#4b9c2d`, bg `#101a0b`, label `#b6f07a`.
2. **Header row** — title (28px/600, `-0.5px`) + subtitle (13px, `#7d877d`) on the left; on the right, in this order:
   track segmented control (Residential only), filter dropdown, **Collapse all / Expand all** (board view only),
   **Board / List** segmented toggle. The toggle is last so it never moves between views.
3. **KPI strip** — 3 stat cards, `#141814` on `#23271f`, 12px radius, min-width 238px.
4. **Columns** — horizontally scrolling row of 306px columns, `#111411` on `#1f231e`, 14px radius, 15px gap.
   Header: chevron + stage label (15px/600) + count chip, then an 11px hint line, then the optional `$ in stage` total
   in IBM Plex Mono `#b6f07a`. Active/positive stages (`result`, `negotiation`, `active`, `meeting`) get a green border.
   On-Hold title is amber `#d8b45e`; Dormant is `#c9a29a`.

**Card** (`#181c17`, border `#262b25`, 11px radius, 14px padding; hover border `#3d4a37`; drag handle = whole card):
track chip row (+ pulsing AI DRAFTED chip) → name (16px/600, click opens record) + account line → tags → metric strip →
sequence bar → next-action block (green `#0f1a0b`/`#2f6b1f`, red `#1e100e`/`#5c2620` when overdue, dashed grey when
unset) → owner row + last-touch → WOW OS link footer → primary CTA (`#7ed321`, black text) → quick-log row
(Call / Text / Visit).

**Collapse behaviour:** the chevron (or the stage title) in a **column header** collapses every card in that stage;
collapse is tracked per pipeline+stage. A collapsed card shows only: track chip row, name, account line, and a
one-line summary — coloured dot + next-action label + due date on the right. Clicking a collapsed card opens its
record. "Collapse all / Expand all" toggles every column in the current pipeline; the button label and caret reflect
whether anything is currently expanded.

**Drag and drop:** cards drag between columns; the hovered column shows a green border and a dashed 56px drop
placeholder at the top of its list. Dropping calls `move(dealId, stageId)`.

### 2. List view
Same header chrome; the columns area is replaced by one table, `#111411` on `#1f231e`, 14px radius, min-width 1080px.
Grid template: `2.1fr 1.05fr 1fr 1.5fr 1.1fr 0.85fr 40px`, 14px gap, 14px/18px row padding, 1px `#191d18` row divider.

Header row (`#0e110e`, 10px/700, `0.9px` tracking, `#6f7a6f`): LEAD · TRACK · STAGE · NEXT ACTION · OWNER ·
LAST TOUCH (right-aligned) · ⋮. **Every header is a sort toggle** — click to sort, click again to reverse; the active
header turns `#c6cdc6` and shows a green ▲/▼. Sort keys: name (alpha), track (label), stage (pipeline order),
next action (overdue first, then due), owner (name), last touch (string).

Row: a 3px×30px accent rail — green `#7ed321` if AI-drafted, dark red `#8c3a30` if overdue, otherwise `#252b23`;
AI-drafted rows also get a subtly lifted background `#0f130e` and a small pulsing "AI" chip beside the name. Name
14.5px/600 with the account line beneath; track chip; stage label (amber for On-Hold, dusty for Dormant); next action
with its status dot, label and due line; owner avatar/AI chip + name; last touch right-aligned in IBM Plex Mono, red
when `staleWarn`. Whole row is clickable → opens the record. Footer bar (`#0e110e`, 12px): "N leads · <pipeline>" left,
overdue tally right.

### 3. Approvals
Three trigger stat cards, then a stack of approval cards (max-width 1120px), each split
`1.35fr / 1fr`: left = the drafted message (channel label, recipient, body copy, Approve & send / Edit / Skip);
right = **"WHY THIS FIRED"** — numbered reasoning bullets plus a footnote. Approving marks the deal handled, clears the
AI DRAFTED chip on the board, and fires a toast. Empty state: "Queue clear. Triggers keep running…".

### 4. Field view
Phone frame with a status bar. Shows the rep's current lead, three big one-tap outcome buttons (min 56px), and a
voice capture block: idle → listening (pulsing mic) → transcript parsed into labelled structured fields
(outcome, next step, date, notes) with a Save button. The point of the screen: **no forms** — speak the outcome, the
system structures it.

### 5. Record (Account detail)
Account header with tags, contacts list, property/site details, an **amber access-notes block** (gate codes, dogs,
parking — the operational detail crews need), and a provenance timeline of every touchpoint showing who or what did it
(AI agent vs. person) and when. Quick-log actions repeat here.

### 6. Manager dashboard
Neglected deals (no touch in 14 days), rep leaderboard, pipeline health by stage, and source → revenue ROI.

### 7. Switcher
Demonstrates the same board rendering Commercial Bid, Biz Dev, and Partner with pipeline-specific columns, metrics,
and KPI styles.

---

## Interactions & behaviour
- **Pipeline select** resets the track filter to "All tracks".
- **Track filter** applies only to Residential.
- **Drag/drop** between columns; state persists in a `moved` map keyed by deal id.
- **Approve** → `handled[dealId] = true` → AI chip clears, board card CTA changes, toast.
- **Quick log** (Call / Text / Visit) → toast + timeline entry; no modal.
- **Book** flow → multi-step (day → time → estimator) → deal moves to Result with an `osRef` and the
  "Linked in WOW OS" footer.
- **Toasts** appear bottom-centre and auto-dismiss.
- **Animations:** `wowFade` 0.22s ease card entry; `wowPulse` 1.6s infinite on AI dots; 0.15s transform on chevrons.
  Keep motion this restrained.

## State
`view` (board | approvals | field | record | manager | switcher) · `pipeline` · `track` · `boardView` (board | list) ·
`collapsedCols` (map of `pipeline:stage` → bool) · `listSort` (`{key, dir}`) · `recordId` · `dragId` · `overCol` ·
`moved` · `handled` · `dismissed` · `toast` · booking substate (`bookingId`, `bookingStep`, `bookDay`, `bookTime`,
`bookEst`) · `voiceStage`.

In production most of this is server state: deals, stages, touchpoints, approvals and the audit timeline belong in the
API; only view mode, collapse state, sort, drag, and toast are client-local. Collapse state and list sort should
persist per user.

## Design tokens
**Surfaces** — page `#0d0f0d` · rail `#0a0c0a` · panel `#111411` · raised `#141814` · card `#181c17` ·
table header/footer `#0e110e` · AI row tint `#0f130e`
**Borders** — hairline `#191d18` · subtle `#1f231e` · default `#23271f` · card `#262b25` · hover `#3b423a` /
`#3d4a37` · active green `#4b9c2d`
**Green (brand)** — primary `#7ed321` · hover `#93e63a` · text-on-dark `#b6f07a` · chip text `#a8ea6b` ·
toggle text `#d5f8a8` · deep bg `#101a0b` / `#0f1a0b` / `#1f2f16` · border `#2f6b1f`
**Amber (revival / on-hold)** — `#d8b45e` on `#2b2413`, border `#4a3a17`
**Red (overdue)** — dot `#e07a68` · text `#f0a294` · bg `#1e100e` · border `#5c2620` · rail `#8c3a30`
**Blue (account-type tags)** — `#7fb2e0` on `#16283a`
**Text** — primary `#e9ede9` · strong `#e2e7e2` · secondary `#c6cdc6` · muted `#98a298` · dim `#7d877d` ·
faint `#6f7a6f` · disabled `#5c655c` / `#4f584f`
**Type** — Poppins 400/500/600/700; IBM Plex Mono for money and dates.
Scale: 28px/600 page title · 16px/600 card name · 15px/600 column title · 14.5px row name · 14px body & CTA ·
13px controls · 12px meta · 11px hints · 10px section labels (0.6–0.9px tracking, 600–700) · 9px chips (0.8–0.9px
tracking, 700).
**Radius** — 4–5px chips · 7px segmented items · 8–9px inner blocks · 10px controls · 11px cards · 12px stat cards ·
14px columns and panels.
**Spacing** — 28px page gutter · 18px section rhythm · 15px column gap · 14px card padding · 11px card stack gap ·
10px control gap.

## Assets
No images. All iconography is unicode glyphs (`▤ ☰ ⋮ ▾ ▲ ▼ ⌄`) — replace with the WOW OS icon set. Fonts are Poppins
and IBM Plex Mono via Google Fonts.

## Suggested agent workstreams
Reasonable parallel split if you're running multiple agents:
1. **Data & API** — deal/account/contact/touchpoint schema, pipeline+stage config as data (not code), stage
   transitions, audit trail.
2. **Trigger & agent service** — the 11-month, seasonal, revival and sequence triggers; draft generation; the
   "why this fired" reasoning payload; approval state machine.
3. **Board & list UI** — columns, drag/drop, collapse, filters, sorting, the shared card component.
4. **Field & voice** — mobile view, one-tap logging, voice→structured-note parsing.
5. **Record & manager** — account detail, timeline provenance, dashboards, source→revenue attribution.
6. **WOW OS integration** — booking hand-off, estimate linkage, Funnel round-trip.

## Open questions to resolve before build
- Which promos exist (trade / referral / direct / retention codes) and who authors them?
- Does the Residential **Result** stage resolve to Won/Lost, or straight into a booking?
- Should the 14-day neglect threshold differ per pipeline (commercial cycles are far longer)?
- The Record screen field set, label casing, and note storage need to match the real WOW OS deal-detail screen —
  that screen wasn't available when this was designed.

## Files
- `WOW Leads v3.dc.html` — the prototype (open in a browser; `support.js` must sit beside it)
- `support.js` — prototype runtime only, not product code

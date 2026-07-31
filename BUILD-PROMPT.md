# WOW Leads v3 — single one-shot build prompt

> Run `cd ~/Desktop/"WOW Leads" && git init && claude`, then paste this entire file
> (or just say: `read BUILD-PROMPT.md and execute it`).

---

You are building **WOW Leads v3** — the pre-Funnel lead & prospecting module for WOW OS —
end to end, in one pass, deployed to Vercel.

**Do not ask me any questions. Do not stop for confirmation. Do not present a plan for
approval.** Make every decision yourself using the defaults in this document. If
something is ambiguous, pick the conventional option, log a one-line note in
`DECISIONS.md`, and keep moving. Report the live URL when you're done.

---

## 0. What this product is

WOW Leads covers everything that happens *before* an estimate is booked. Four pipelines
on one shared Account/Contact data model, with AI agents that draft touchpoints on a
schedule, humans who approve them, field reps who log outcomes by voice or one tap, and a
hand-off into the existing WOW OS Funnel when a deal becomes an estimate.

**The signature flow the app must demonstrate end to end:**
11-month trigger fires → AI drafts a touchpoint → human approves it in the Approvals
queue → rep logs the outcome in the field (one tap or voice-to-structure) → the Account
record shows the full provenance timeline → deal books and appears in the WOW OS Funnel as
"Estimate Scheduled."

## 1. Read the references first

Already in this repo at `./design-refs/`:

- **`design-refs/README.md`** — the authoritative handoff spec. Read it fully: data model,
  all 7 screens, interactions, state, design tokens, open questions.
- **`design-refs/WOW Leads v3.dc.html`** — the interactive prototype. Extract and use
  verbatim as the seed dataset: `state.deals` (23 fixture leads across all four
  pipelines), `PIPES`, `TRACKS`, `TAG_STYLE`, `TRACK_STYLE`, `ESTIMATORS`, `DAYS`,
  `TIMES`, `APPROVALS`, and the manager-dashboard fixtures.
- **`design-refs/support.js`** — prototype runtime only. **Ignore it entirely. Do not
  port it, do not read past the first few lines.**

The prototype is a design reference authored in HTML, not production code — do not lift it
directly. Recreate the screens properly in the stack below. **Fidelity is high:** colors,
type sizes, spacing, radii, copy, and interaction states are final-intent. Match them.

## 2. Locked stack — do not deviate

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4, design tokens as CSS custom properties in `globals.css` |
| Fonts | `next/font` — Poppins (400/500/600/700), IBM Plex Mono |
| DB | Postgres on Neon (Vercel-native), Drizzle ORM + drizzle-kit migrations |
| Data access | RSC for reads, Server Actions for writes |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| URL/view state | `nuqs`; `zustand` only if genuinely needed |
| Validation | Zod on every server-action boundary |
| Icons | `lucide-react` (prototype uses unicode glyphs `▤ ☰ ⋮ ▾ ▲ ▼ ⌄` — swap, keep the same optical weight) |
| AI drafting | `@anthropic-ai/sdk`, `claude-sonnet-5`, with a deterministic template fallback so the app is fully usable with no `ANTHROPIC_API_KEY` |
| Voice | Web Speech API capture → server action + Claude for transcript→structured parse, deterministic regex fallback |
| Tests | Vitest (unit/logic) + Playwright (5 critical flows) |
| Tooling | pnpm, ESLint, Prettier, conventional commits |
| Deploy | Vercel CLI, production deploy at the end |

**No auth for v1.** Hard-code the current user (`Marshall Behrns`, role `manager`) in
`lib/current-user.ts` with a TODO marker so real auth drops in later. Add a rep switcher
in the left-rail footer that changes the current user client-side — it makes the Field
view and leaderboard demoable.

## 3. Data model

### Deal / Lead
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `pipe` | `resi \| comm \| bizdev \| partner` | which pipeline the lead lives in |
| `track` | `referral \| repeat \| revival` | Residential only; drives the coloured track chip |
| `stage` | stage id | must be a stage of its own pipeline |
| `name` | string | person (resi/bizdev), project name (commercial), or company (partner) |
| `account` | string | address, company, or contact line — secondary line on the card |
| `tags` | string[] | account-type + work-type tags, styled by category |
| `source` | string | Past Customer, Yard Sign, Google Ads, Partner Referral, Cold Call, Web Form, Door Hanger, GC Referral |
| `owner` | `{initials, name, agent: boolean}` | `agent: true` renders the square **AI** chip instead of a round avatar |
| `assignedBy` | string | provenance: "Self-sourced", "Trigger → Dani", "Bright Path RE → Reese", "Sequence → Jorden" |
| `aiPending` | boolean | unapproved AI draft exists → pulsing "AI DRAFTED" chip |
| `stale` | string | human last-touch string ("19d silent", "11 mo since job") |
| `staleWarn` | boolean | renders `stale` in the red tone |
| `metrics` | `{label, value}[]` | up to 2, rendered as a split stat strip |
| `seq`, `seqName`, `seqStep` | number / string | Biz Dev sequences — 4-segment progress bar |
| `next` | `{label, due, state: 'ok' \| 'overdue'} \| null` | null renders the dashed "Not set / Required" state |
| `act` | string | primary CTA ("Review draft", "Log Call", "Send Text", "Log Visit", "View in Funnel") |
| `quick` | boolean | show the Call / Text / Visit quick-log row |
| `osRef` | string? | WOW OS estimate id → "Linked in WOW OS · EST-40218" footer |
| `initialType` | string? | Biz Dev: "Cold call · Jul 28" — replaces `stale` in the card footer |

### Pipelines and stages

**Residential Re-marketing** (`resi`, dot `#7ed321`, has tracks) — *"Referral, repeat-work
and revival tracks — the highest-margin pipeline we already own."*
`past` Past Customer (Eligible, not yet approached) → `first` Followed Up (First ask made)
→ `second` 2nd Follow-up (Second touch, no answer yet) → `promo` Promo Offered (Offer on
the table) → `followed` Promo Followed Up (Chasing the offer) → `result` Result (Booked,
or parked with a retry date)

**Commercial Bid** (`comm`, dot `#7fb2e0`) — *"Long-cycle bids. On-Hold is a real state,
not a failure."*
`prospect` Prospecting → `invited` Bid Invited → `takeoff` Plan Review / Takeoff →
`submitted` Bid Submitted → `negotiation` Negotiation → `hold` On-Hold (Alive, paused —
revisit date set). Column headers in this pipeline show a `$XXXK in stage` roll-up
computed from each card's EST. VALUE / BID metric.

**Biz Dev / Prospecting** (`bizdev`, dot `#b19ad6`) — *"Multi-touch sequences generate the
tasks. Hands off to Commercial or Residential at first meeting."*
`initial` Initial Contact Made → `followup` Follow-up In Progress → `meeting` First
Meeting. Cards carry sequence progress.

**Industry Partner** (`partner`, dot `#e0a52b`) — *"Not a deal pipeline — a relationship
one. The scoreboard is referrals sent and revenue attributed."*
`identified` Identified → `introduced` Introduced → `active` Active Referrer → `dormant`
Dormant (no referral in 90+ days). Card metrics are REFERRALS SENT and ATTRIBUTED.

### Tracks (Residential only)
`All tracks | Referral | Repeat work | Revival`

```
referral  bg #101a0b  color #a8ea6b  border #2f6b1f  label REFERRAL
repeat    bg #101a0b  color #a8ea6b  border #2f6b1f  label REPEAT WORK
revival   bg #2b2413  color #d8b45e  border #4a3a17  label REVIVAL
```
Revival is deliberately **amber** — a paused-not-dead state, distinct from active green
and from lost.

### Tag styles
```
GENERAL CONTRACTOR / PROPERTY MANAGER / HOA BOARD / FACILITY MANAGER  #7fb2e0 on #16283a
DIRECT HOMEOWNER                                                      #98a298 on #23271f
INDUSTRY PARTNER                                                      #d8b45e on #2b2413
INTERIOR / EXTERIOR / INDUSTRIAL                                      #9dbd80 on #1e2519
```

### Booking fixtures
```
ESTIMATORS  KJ Kris Jolin (3 estimates that day) · GS Granville Smith (1) · CM Craig Merrills (5)
DAYS        Wed Aug 5 · Thu Aug 6 · Fri Aug 7 · Mon Aug 10
TIMES       8:30 AM · 10:00 AM · 1:00 PM · 3:30 PM
```

## 4. Design tokens — use these exact values

```
Surfaces   page #0d0f0d · rail #0a0c0a · panel #111411 · raised #141814 · card #181c17
           table header/footer #0e110e · AI row tint #0f130e
Borders    hairline #191d18 · subtle #1f231e · default #23271f · card #262b25
           hover #3b423a / #3d4a37 · active green #4b9c2d
Green      primary #7ed321 · hover #93e63a · text-on-dark #b6f07a · chip text #a8ea6b
           toggle text #d5f8a8 · deep bg #101a0b / #0f1a0b / #1f2f16 · border #2f6b1f
Amber      #d8b45e on #2b2413, border #4a3a17     (revival / on-hold)
Red        dot #e07a68 · text #f0a294 · bg #1e100e · border #5c2620 · rail #8c3a30
Blue       #7fb2e0 on #16283a                     (account-type tags)
Text       primary #e9ede9 · strong #e2e7e2 · secondary #c6cdc6 · muted #98a298
           dim #7d877d · faint #6f7a6f · disabled #5c655c / #4f584f
Type       Poppins 400/500/600/700; IBM Plex Mono for money and dates.
           28/600 page title · 16/600 card name · 15/600 column title · 14.5 row name
           14 body & CTA · 13 controls · 12 meta · 11 hints
           10 section labels (0.6–0.9px tracking, 600–700) · 9 chips (0.8–0.9px, 700)
Radius     4–5 chips · 7 segmented · 8–9 inner blocks · 10 controls · 11 cards
           12 stat cards · 14 columns/panels
Spacing    28 page gutter · 18 section rhythm · 15 column gap · 14 card padding
           11 card stack gap · 10 control gap
Motion     wowFade 0.22s ease card entry · wowPulse 1.6s infinite on AI dots
           0.15s transform on chevrons. Keep motion this restrained — add nothing else.
Left rail  252px, #0a0c0a, 1px right border #1f231e: avatar, org, nav list,
           footer with location switcher
```

No images anywhere in this product.

## 5. Build order — foundation first, then six agents in parallel

### 5a. You (orchestrator), serially

1. `pnpm create next-app` — TS, Tailwind, App Router, ESLint.
2. `globals.css` — the full token set above as CSS custom properties, plus the `wowFade`
   and `wowPulse` keyframes.
3. `lib/types.ts` — every type in the data model above.
4. `lib/pipelines.ts` — `PIPES`, `TRACKS`, `TAG_STYLE`, `TRACK_STYLE` as **data, not
   code**, typed and exported.
5. `db/schema.ts` (Drizzle) + first migration against a Neon branch.
6. Commit. **Then launch all six agents concurrently via the Task tool.**

Give each agent the file-path ownership below so no two agents ever touch the same file.

### Agent 1 — Data & API
Owns `db/**`, `lib/repositories/**`, `app/api/**`, `scripts/seed.ts`

- Tables: `accounts`, `contacts`, `deals`, `pipelines`, `stages`, `touchpoints`,
  `approvals`, `sequences`, `sequence_steps`, `promos`, `audit_events`, `users`,
  `locations`, `access_notes`.
- Pipelines and stages are **rows, not enums** — stage order is an integer column so
  stages are reconfigurable without a deploy.
- Every write goes through a repository function that also appends an `audit_events` row:
  actor (`user_id` **or** `agent_id`), action, before/after, timestamp. The Record screen's
  provenance timeline reads straight off this table.
- Stage-transition validation: a deal may only move to a stage of its own pipeline. Reject
  cross-pipeline moves **at the repository layer**, not in the UI.
- `scripts/seed.ts` — all 23 prototype deals, 3 approvals, estimators, promos, partner and
  commercial metrics. Idempotent, safe to re-run.
- Derived reads the UI needs: `$ in stage` roll-ups for Commercial (sum of EST. VALUE / BID
  per stage), overdue tally, neglected-deal query (no touchpoint in N days).

### Agent 2 — Trigger & agent service
Owns `lib/agents/**`, `lib/triggers/**`, `app/api/cron/**`

- Four trigger types: **11-month warranty** (job completed 11 months ago, no contact since
  the completion follow-up), **seasonal promo**, **revival** (lost ≥6 months ago, price
  objection, cooling period done), **sequence step** (Biz Dev 4-touch).
- Each fired trigger creates an `approvals` row with: channel (SMS/email, chosen from the
  contact's stated preference), recipient, drafted body, a **`reasons: string[]`** payload,
  and a `footnote` — this is the "WHY THIS FIRED" panel. Reasons must be derived from real
  record facts (completion date, last contact, original scope, reply latency), never
  invented prose.
- Approval state machine: `drafted → approved → sent` / `drafted → edited → sent` /
  `drafted → skipped`. Approving sets `deals.ai_pending = false`, appends a touchpoint and
  audit event with agent provenance, advances `next_action`, and fires a toast.
- `app/api/cron/triggers/route.ts` — Vercel Cron, daily 06:00, guarded by `CRON_SECRET`.
  Add the `vercel.json` cron config.
- Draft copy register must match the prototype's approval bodies: first person, named,
  specific to the actual job, one clear ask, zero marketing fluff. Reference example:

  > Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty inspection is coming
  > up on the interior work we finished last August. It is a good moment to touch up the
  > hallway and stairwell zones that take the most traffic. Want me to bring an estimator
  > by in the next couple of weeks?

### Agent 3 — Board & List UI
Owns `app/(app)/board/**`, `components/board/**`, `components/card/**`, `components/list/**`

**Pipeline selector** — 4 cards in a wrapping row, 196px min-width, 11px radius, 11/16px
padding, coloured dot + label + meta line. Selected: border `#4b9c2d`, bg `#101a0b`, label
`#b6f07a`. Selecting a pipeline resets the track filter to "All tracks".

**Header row** — title (28px/600, `-0.5px`) + subtitle (13px, `#7d877d`) left. On the
right, in this order: track segmented control (Residential only) → filter dropdown →
Collapse all / Expand all (board view only) → Board/List segmented toggle. **The toggle is
last so it never moves between views.**

**KPI strip** — 3 stat cards, `#141814` on `#23271f`, 12px radius, 238px min-width.

**Columns** — horizontally scrolling 306px columns, `#111411` on `#1f231e`, 14px radius,
15px gap. Header: chevron + stage label (15px/600) + count chip, then an 11px hint line,
then the optional `$ in stage` total in IBM Plex Mono `#b6f07a`. Active/positive stages
(`result`, `negotiation`, `active`, `meeting`) get a green border. On-Hold title is amber
`#d8b45e`; Dormant is `#c9a29a`.

**One shared `<LeadCard>`** — `#181c17`, border `#262b25`, 11px radius, 14px padding, hover
border `#3d4a37`, whole card is the drag handle. Order: track chip row (+ pulsing AI
DRAFTED chip) → name 16px/600 (click opens record) + account line → tags → metric strip →
sequence bar (4 segments) → next-action block (green `#0f1a0b`/`#2f6b1f`; red
`#1e100e`/`#5c2620` when overdue; dashed grey "Not set / Required" when null) → owner row +
last-touch → "Linked in WOW OS · EST-40218" footer → primary CTA (`#7ed321`, black text) →
quick-log row Call / Text / Visit. `owner.agent === true` renders the square **AI** chip
instead of a round avatar.

**Collapse** — the chevron or the stage title in a column header collapses every card in
that stage; tracked per `pipeline:stage`. A collapsed card shows only: track chip row,
name, account line, and a one-line summary (coloured dot + next-action label + due date
right-aligned). Clicking a collapsed card opens its record. "Collapse all / Expand all"
toggles every column in the current pipeline; its label and caret reflect whether anything
is currently expanded. **Persist collapse state and list sort per user.**

**Drag & drop** — cards drag between columns; the hovered column shows a green border and a
dashed 56px drop placeholder at the top of its list. Dropping calls the
`moveDeal(dealId, stageId)` server action with optimistic UI and rollback on error.

**List view** — same header chrome; columns area replaced by one table, `#111411` on
`#1f231e`, 14px radius, min-width 1080px. Grid `2.1fr 1.05fr 1fr 1.5fr 1.1fr 0.85fr 40px`,
14px gap, 14/18px row padding, 1px `#191d18` row divider. Header row `#0e110e`, 10px/700,
0.9px tracking, `#6f7a6f`: LEAD · TRACK · STAGE · NEXT ACTION · OWNER · LAST TOUCH
(right-aligned) · ⋮. **Every header is a sort toggle** — click to sort, click again to
reverse; the active header turns `#c6cdc6` and shows a green ▲/▼. Sort keys: name (alpha),
track (label), stage (pipeline order), next action (overdue first, then due), owner (name),
last touch (string). Row: 3px×30px accent rail — green `#7ed321` if AI-drafted, dark red
`#8c3a30` if overdue, otherwise `#252b23`; AI-drafted rows also get background `#0f130e`
and a small pulsing "AI" chip beside the name. Name 14.5px/600 with the account line
beneath; track chip; stage label (amber for On-Hold, dusty for Dormant); next action with
status dot, label and due line; owner avatar/AI chip + name; last touch right-aligned in
IBM Plex Mono, red when `staleWarn`. Whole row clickable → record. Footer bar `#0e110e`
12px: "N leads · <pipeline>" left, overdue tally right.

### Agent 4 — Field & voice
Owns `app/(app)/field/**`, `components/field/**`, `lib/voice/**`

- Phone frame with a status bar. The rep's current lead, three big one-tap outcome buttons
  (min 56px), and a voice capture block: idle → listening (pulsing mic) → transcript parsed
  into labelled structured fields (outcome, next step, date, notes) with a Save button.
- **The point of this screen is no forms** — speak the outcome, the system structures it.
  Parsing runs server-side and returns a Zod-validated object; the rep can edit any field
  before saving. Saving writes a touchpoint + audit event and updates `next_action`.
- Make the route genuinely usable at a real phone viewport, not only inside the mock frame
  — this is the one screen reps actually use in the field.

### Agent 5 — Record & manager
Owns `app/(app)/record/**`, `app/(app)/manager/**`, `components/record/**`, `components/manager/**`

- **Record (Account detail):** account header with tags, contacts list, property/site
  details, an **amber access-notes block** (`#d8b45e` on `#2b2413`, border `#4a3a17`) for
  gate codes, dogs, parking — the operational detail crews need — and a provenance timeline
  of every touchpoint showing who or what did it (AI agent vs. person) and when. Quick-log
  actions repeat here. Put every field label in `lib/record-fields.ts` as config so it can
  be remapped to the real WOW OS deal-detail screen without touching components.
- **Manager dashboard:** neglected deals (no touch in 14 days), rep leaderboard, pipeline
  health by stage, source → revenue ROI. Make the neglect threshold a per-pipeline config
  value: 14 days for resi/bizdev/partner, **45 days for commercial** — commercial cycles
  are far longer.

### Agent 6 — WOW OS integration, Switcher, deploy prep
Owns `lib/wow-os/**`, `app/(app)/switcher/**`, `vercel.json`, `.env.example`, `README.md`

- **Booking flow:** multi-step (day → time → estimator, using DAYS / TIMES / ESTIMATORS
  above) → deal moves to Result with an `osRef` (`EST-#####`) and renders the "Linked in
  WOW OS" footer.
- `lib/wow-os/client.ts` — a thin, clearly-marked adapter interface for the real WOW OS
  Funnel API with an in-memory implementation behind it, so swapping in the real endpoint is
  a one-file change. Round-trip: create estimate → read status back → surface "Estimate
  Scheduled".
- **Switcher screen:** the same board rendering Commercial Bid, Biz Dev and Partner with
  pipeline-specific columns, metrics and KPI styles — proof the board is pipeline-generic.
- `.env.example`, deploy docs, Vercel project config, cron config.

## 6. Interactions & state

- Pipeline select resets the track filter to "All tracks".
- Track filter applies only to Residential.
- Approve → AI chip clears, board card CTA changes, toast fires.
- Quick log (Call / Text / Visit) → toast + timeline entry, **no modal**.
- Book flow → day → time → estimator → Result + `osRef` + WOW OS footer.
- Toasts appear bottom-centre and auto-dismiss.

Client-local state only: view mode, collapse state, list sort, drag, toast. **Everything
else is server state** — deals, stages, touchpoints, approvals, audit timeline all live in
the API. Collapse state and list sort persist per user.

## 7. Resolve the open questions yourself

Decide each, implement it, log it in `DECISIONS.md` with a one-line rationale:

1. **Promos** — model a `promos` table (code, type: trade/referral/direct/retention,
   discount, window, authoring user). Seed the "15% spring interior" offer.
2. **Residential Result stage** — resolves to a sub-outcome: `booked` (gets an `osRef`) or
   `parked` (gets a retry date). Both live in Result; the card metric shows which.
3. **Neglect threshold** — per-pipeline, as specified in Agent 5.
4. **Record screen field set** — build to the spec above, keep labels in config, and flag
   in `DECISIONS.md` that it needs sign-off against the real WOW OS deal-detail screen.

## 8. Verify before deploying — all of it, no skipping

1. `pnpm tsc --noEmit` and `pnpm lint` clean. Zero `any` in committed code.
2. **Vitest:** stage-transition validation, all six list sort comparators in both
   directions, `$ in stage` roll-up math, trigger eligibility predicates, voice transcript
   parser, approval state machine.
3. **Playwright — the five flows that matter:**
   - **The signature flow:** trigger fires → draft appears in Approvals with a populated
     "WHY THIS FIRED" → approve → AI DRAFTED chip clears on the board → toast → rep logs
     the outcome in Field → Record timeline shows full provenance → book → deal lands in
     Result with the WOW OS footer.
   - Drag a card between columns; reload; it stayed.
   - Collapse a column and sort the list; reload; both persisted.
   - Switch all four pipelines; each renders its own stages, metrics and KPIs; no
     cross-pipeline stage leakage.
   - An overdue card and an overdue row both render in the red tone with the correct rail.
4. Screenshot Board, List, Approvals, Field, Record, Manager and Switcher at 1440px, and
   Field at 390px. **Open each screenshot and compare it against the prototype rendered in
   a browser.** Fix every visual divergence, then re-screenshot. Do not skip this — the
   fidelity bar is high.
5. Browser console clean on every route: zero errors, zero React key warnings.
6. Lighthouse on Board: no CLS from the column scroller, no layout shift on card entry.

## 9. Ship it

1. Conventional commits throughout — not one giant commit at the end.
2. Create the Vercel project, provision the Neon Postgres integration, set env vars
   (`DATABASE_URL`, `ANTHROPIC_API_KEY` if available, `CRON_SECRET`), run migrations and the
   seed against production, `vercel --prod`.
3. Smoke-test the production URL: load every route, approve one draft, drag one card.
4. Report back: live URL, repo layout, what each agent delivered, `DECISIONS.md` contents,
   and anything you consciously deferred.

**Start now. Foundation first, then all six agents in parallel.**

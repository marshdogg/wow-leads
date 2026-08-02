# DECISIONS

Every judgement call made during the one-pass build, with the reasoning in one
line. The four items under "Open questions resolved" are the ones the handoff
spec (`design-refs/README.md`) explicitly left open.

## Open questions resolved

1. **Promos** — modelled as a `promos` table (`code`, `type` ∈ trade | referral |
   direct | retention, `discount`, `window_start`/`window_end`, `authored_by`),
   with the "15% spring interior" offer seeded as `SPRING15` (type `direct`) and
   linked to deal `r5`. A table rather than an enum because promo authorship and
   windows are operational data that changes without a deploy.
2. **Residential Result stage** — ~~resolves to a sub-outcome rather than
   Won/Lost: `booked` (carries an `osRef`) or `parked` (carries a retry date).
   Both live in Result; the card's metric strip shows which.~~
   **Superseded** by `RECONCILE-outcomes-and-neglect.md`, which identified that
   this conflated two different axes. Neither `booked` nor `parked` is a loss,
   so a lead saying "never contact me again" had nowhere to go, Residential win
   rate was uncomputable, and the Lost-Lead Revival trigger had no Residential
   path. The original reasoning was right about *disposition* and silent about
   *outcome*:
   - **Outcome** is the stage's `semanticType` — `won` or `lost`. It drives
     win-rate maths, roll-up reporting and styling.
   - **Disposition** is the sub-outcome on the deal — `booked` or `parked`.
     Both sit **inside `won`**: a re-marketing touch that lands an estimate and
     one that earns a committed retry date are both successes. The metric-strip
     rendering and both seeded examples (Lorna Kirkbride → booked, EST-40218;
     Simone Achterberg → parked, retry Spring 2027) are preserved intact.

   `Result` was renamed to **Won** and **kept its id** (`result`): a rename
   must never move history, so the seeded deals and their timelines follow.
   A `Lost` stage is new, and entry requires `lostReason` + `lostAt`. The same
   treatment was applied wherever a pipeline lacked an explicit outcome —
   Commercial's On-Hold became a parallel `paused` state with a revisit date
   rather than the terminal column. A pipeline can no longer be saved without
   at least one `won` and one `lost` stage, which is the rule that stops this
   recurring.
3. **Neglect threshold** — per-pipeline, stored as `pipelines.neglect_days`:
   **14 days** for Residential, Biz Dev and Partner, **45 days** for Commercial,
   because commercial bid cycles run months and a 14-day rule would flag every
   healthy bid. Those values were correctly reasoned and remain the pipeline
   defaults.
   **Extended** by `RECONCILE-outcomes-and-neglect.md`, which layered a
   per-stage override on top and excluded stages by semantic type. Resolution
   is most-specific-wins: `stage.neglectDays` → `pipeline.neglect_days` →
   `DEFAULT_NEGLECT_DAYS`.

   The defect this closed: a Commercial bid moved to On-Hold with a revisit
   date six months out still tripped the 45-day rule. It was flagged as
   neglected while sitting exactly where somebody deliberately put it — a false
   positive by design, and the failure mode that teaches people to ignore the
   alert. So `paused` stages are excluded from neglect entirely, and `won` and
   `lost` are excluded as closed. A paused deal instead comes due when its
   `revisitDate` passes, surfaced as its own "revisit due" signal next to
   neglect on the manager dashboard but visually distinct, because the two mean
   different things to whoever is reading it.
4. **Record screen field set** — built to the handoff spec, with every field
   label held in `lib/record-fields.ts` as typed config so the set can be
   remapped without touching a component. **This needs sign-off against the real
   WOW OS deal-detail screen**, which was not available when the prototype was
   designed — flagged as the top open item at handover.

## Divergences from the prototype

- **Neglected deals shows 4, and not the prototype's 4.** The prototype
  hard-codes a 4-row / $139K fixture. The dashboard computes the list from the
  data instead, and the membership is entirely different. Under the 45-day
  Commercial threshold, `c3` (16 days silent) is not neglected. Under the
  semantic-type exclusions added by the reconciliation, `p5` dropped out too —
  it sits in `dormant`, a `paused` stage, and a deal parked on purpose is not
  neglected. What remains is `r11` (22d), `b4` (21d), `r4` (19d) and `n2` (1d,
  against the New Leads one-day threshold). `r2` and `r6` look long-silent but
  are correctly excluded by the "no on-time next action booked" clause.
  Reverting any of this means changing a threshold or a semantic type, not the
  query.
- **"WHY THIS FIRED" reasons render as green ✓ marks, not numbered bullets.**
  The build brief said numbered; the prototype — which the handoff spec declares
  final-intent on fidelity — uses ✓. Fidelity won.
- **The Field view shows the record's real next action, not the prototype's.**
  The prototype had a standalone `field` fixture ("Walk the interior, quote the
  touch-ups" / "Today · warranty visit") that was never reconciled with deal
  `r1`, whose next action is "Warranty check-in — approve the draft". The screen
  reads the deal, so it shows the deal's own next action. Its own annotation
  argues for this — "Same record, not a mobile app. Nothing needs syncing back."
  Reseeding `r1` to match would change the board card and the Approvals queue
  too. The address likewise shows the seeded `2712 Cathedral Ave NW` without the
  prototype's "· Woodley Park" suffix, which exists nowhere in the data.
- **The prototype's annotation overlays are not reproduced.** The stat-card
  checkboxes and ⓘ icons, the record's "INFERRED — CONFIRM AGAINST REAL WOW OS
  SCREENS" panel and the dashboard's "FUTURE STATE · PRD §3" panel are
  design-review scaffolding gated behind the prototype's `annotations` prop.
  They are not product UI and are omitted. The substance of the INFERRED note is
  open question #4 above.

## Bulk approval changes what the guarantee means

The product's central promise is that **nothing sends until a human approves
it**, and until campaigns arrived that meant a person read every individual
message. Bulk mode is the first place someone approves something they have not
read in full. That is a reasonable trade for a newsletter and it should be
stated plainly rather than implied by a mode name.

What bulk actually approves is a **campaign version**: the audience rule, the
steps, and the resolved copy for each step. Editing any of those revokes the
approval — a hash of those fields is stored alongside `approvedAt`, and if it
moves the campaign stops sending until someone approves again. Without that,
"approve once" would be a hole an edit could pass through afterwards.

Two shapes were rejected on the way here:

- **One approval row per run.** This was the original proposal and it fails on
  the campaign that motivated the whole feature. Review requests use an
  exact-day audience, so new people qualify *every day* — a daily trickle of
  one to three recipients. Per-run approval would produce the same queue volume
  as per-message with less information in each row: a count instead of a
  message. It would have made the post-job case worse than the default it
  existed to improve.
- **Campaign approvals as `approvals` rows.** Kept out deliberately, so the
  Approvals queue continues to mean "messages awaiting review". That is what
  makes the count on the left rail meaningful; a campaign sitting alongside
  three drafted texts would degrade a number people rely on. Campaign approval
  lives on the campaign row instead.

Per-message remains the default. A franchise opts into bulk deliberately.

**Bulk requires every step to pin a template.** These two defaults were set
separately and contradict each other: a campaign step leaves `templateId` null
so its copy follows the Templates screen, and bulk approval hashes the resolved
copy of each step. A step with no pinned template has no copy to hash — hashing
the empty string would tick the approval box over nothing, a hole in exactly
the guarantee bulk is trading against. Bulk approval means a human approved
*this copy* going to *this rule*; unpinned copy is not specific, so there is
nothing to have approved. Refused in the editor, in the approve action, and in
the runner. Null remains the right default for per-message campaigns, where
every send is reviewed individually.

**The hash covers the audience rule, not the audience size** — a campaign
approved when a tag matched 50 accounts would keep its approval at 5,000,
because nothing about the campaign changed. The policy was approved; the volume
was not. That gap is closed by `volumeGate` in `lib/campaigns/approval.ts`
(`VOLUME_JUMP_FACTOR = 4`, `VOLUME_FLOOR = 25`), which pauses a run and asks.

It compares against **the previous run, not the audience size at approval** —
the opposite of what this paragraph originally proposed, and the change is
worth recording. Measuring from approval time punishes growth: a franchise
adding a hundred customers a month trips any fixed multiple eventually, every
year, and a guard that cries wolf on ordinary success gets turned off, which is
worse than not having one. Consecutive runs make gradual growth invisible while
a bulk import or a mistyped audience appears as a step change on the first run
after it happens. Simulated: forty runs at 8% compounding growth, 50 → 1000+,
never trips; a single 50 → 5000 jump trips immediately. A tripped run pauses
and asks without revoking the approval — the run is the surprising thing, not
the policy.

**A second bypass, found while wiring the pinning rule and worse than it.** The
approval gate only ran when a plan contained an `advance` action. But a first
step with `delayDays: 0` sends on the day someone enrols, so an `enrol` is a
send too — and on a post-job review campaign, where everyone is on step one the
day they qualify, it is the *only* kind of send that ever happens. A bulk
review campaign would have sent step one to everybody with the gate never
consulted: the exact campaign bulk mode was designed for, entirely ungated. The
volume guard shared the blind spot from the same line. Both now count advances
plus immediate enrolments, and the gate lives inside `campaignGate` rather than
beside it — three callers share it, and a gate each caller has to remember to
invoke is one somebody eventually doesn't.

## Other decisions worth knowing

- **Every route stacks to one column below `md`, not just the Field view.** The
  brief scoped the phone requirement to `/field`, and the prototype is a
  1600×1040 desktop design — but at 390px the record's `1.4fr 1fr` grid pushed
  its whole right column (RECORD meta, NEXT STEP, Suggestions) off-screen and
  clipped it. The deciding case was the **amber access-notes block**: "side gate
  code 4417, park in the alley behind, two cats" is read standing at a gate
  holding a phone. Stacking a grid is the conventional degradation rather than a
  new design, so `/record` and `/manager` collapse under `md:` with desktop
  untouched. No mobile-only affordances were invented and nothing is hidden.
  `scripts/shoot-app.mjs` asserts zero overflow at 390px on every route.
- **The overflow check excuses an element only when an ancestor can genuinely
  scroll to reveal it** — `scrollWidth > clientWidth`, not merely
  `overflow-x: auto`, and never `<html>`/`<body>`, because the page scrolling
  sideways *is* the defect. `overflow-x: hidden` is not excused either: that
  content is lost rather than reachable. Two looser rules were tried and both
  were wrong — exempting every `overflow-x: auto` ancestor reported 0px on a
  record grid whose right column was visibly clipped, and exempting only the
  board's strip by name rejected the legitimate scroll containers another
  screen had added. The check also compares against a **fixed 390**, never
  `window.innerWidth`: under mobile emulation the layout viewport expands to
  fit overflowing content, so the difference silently reads zero. That last bug
  was masking a real defect — `/board` was dragging the whole page sideways by
  543px because a flex child kept its default `min-width: auto` and the header
  control row never wrapped.

- **`last_touch_at` means the most recent touchpoint**, not the age of whatever
  the `stale` display string happens to mention. The two are stored separately:
  "4 mo since job" describes a job, "19d silent" describes a touch, and only the
  latter should drive neglect. Seeding the first version from the display string
  reported six neglected deals, including ones with a call booked for tomorrow.
  The seed now asserts the invariant and prints "last_touch_at agrees with the
  newest touchpoint on every deal" on every run.
- **Touchpoint provenance comes from the actor, not the deal owner.** A human
  quick-logging a call on an agent-owned deal is recorded as the human. Only an
  approved AI draft reads as an agent action, in the composite form
  "Re-marketing agent · approved by Marshall Behrns".
- **The app is fully usable with no `ANTHROPIC_API_KEY`.** The deterministic
  template drafter and the regex voice parser are the default implementations,
  not error fallbacks; setting the key swaps in `claude-sonnet-5` behind the
  same interfaces. Nothing was deployed with a key, so what is live is the
  deterministic path.
- **The shell hides the 252px rail below the `md` breakpoint.** Keeping it on a
  390px phone left 138px for content. The Field view — the only screen reps use
  on a phone — carries its own mobile header.
- **The e2e suite re-seeds before running.** The tests approve drafts, drag
  cards and save notes against the same database the app reads, so without a
  reset they are order-dependent: the signature-flow test clears `r1`'s
  AI-drafted state and the list-view test then fails for an unrelated reason.
- **No auth, deliberately.** `lib/current-user.ts` hard-codes Marshall Behrns
  (manager) behind a `TODO(auth)` marker and is the single seam real auth drops
  into. The left-rail rep switcher is a demo affordance on top of it.

## Known gaps at handover

- **`CRON_SECRET` is set for Production and Development but not Preview.** The
  Vercel CLI's `env add … preview` returns `git_branch_required` and then
  rejects the exact command it tells you to run. The daily trigger cron only
  runs against Production, so this does not affect the deployment; set it from
  the Vercel dashboard if preview deployments ever need the endpoint.
- The Record field set still needs sign-off against the real WOW OS deal-detail
  screen (open question #4).
- **`pnpm seed` deliberately does not reset `users.board_prefs`.** Collapse
  state and list sort are a person's saved preferences, not demo fixtures, so
  the seed leaves them alone. The consequence is that clicking around a demo
  leaves the board sorted however you left it. To reset the demo to the
  prototype's opening state, run:
  `update users set board_prefs = '{"collapsedCols":{},"listSort":{"key":"next","dir":1}}'::jsonb;`
- **No git remote is configured.** The repository is local only; nothing was
  pushed to GitHub.

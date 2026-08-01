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
2. **Residential Result stage** — resolves to a sub-outcome rather than
   Won/Lost: `booked` (carries an `osRef`) or `parked` (carries a retry date).
   Both live in Result; the card's metric strip shows which. Matches the
   prototype's two Result cards — Lorna Kirkbride (booked, EST-40218) and
   Simone Achterberg (parked, retry Spring 2027).
3. **Neglect threshold** — per-pipeline, stored as `pipelines.neglect_days`:
   **14 days** for Residential, Biz Dev and Partner, **45 days** for Commercial,
   because commercial bid cycles run months and a 14-day rule would flag every
   healthy bid. See the consequence logged under "Divergences from the
   prototype" below.
4. **Record screen field set** — built to the handoff spec, with every field
   label held in `lib/record-fields.ts` as typed config so the set can be
   remapped without touching a component. **This needs sign-off against the real
   WOW OS deal-detail screen**, which was not available when the prototype was
   designed — flagged as the top open item at handover.

## Divergences from the prototype

- **Neglected deals shows 3, not 4.** The prototype hard-codes a 4-row / $139K
  neglected fixture that includes `c3` (Ivy City Warehouse, Commercial, 16 days
  silent). Under the 45-day Commercial threshold resolved above, `c3` is not
  neglected. The dashboard computes the list, the count and the total from the
  data rather than reproducing the fixture, so it shows `b4` (21d), `r4` (19d)
  and `p5` (152d). Reverting to 4 rows means changing the Commercial threshold,
  not the query.
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
  `scripts/shoot-app.mjs` asserts zero overflow at 390px on every route, with
  one named exemption: the board's column strip, which is *meant* to scroll
  sideways and whose content stays reachable.

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

# Changelog — outcome model + neglect reconciliation

Implements `RECONCILE-outcomes-and-neglect.md`, which resolves two conflicts
between `DECISIONS.md` and `WOW-Leads-v3-Review-and-Addendum.md`.

Scope note: the addendum's STATUS block records that **the app is the source of
truth and the v3 HTML prototype is a dead artifact not carried forward to v4**.
Nothing here touches `design-refs/`.

---

## Conflict 1 — outcome vs disposition

`DECISIONS.md` #2 conflated *outcome* (did we win or lose?) with *disposition*
(what happens next?). Both are kept, on separate axes.

| Change | Detail |
|---|---|
| `SemanticType` added | `open · positive · paused · won · lost` on every stage |
| Residential `Result` → `Won` | **Id unchanged (`result`)** — a rename must not move history |
| Residential `Lost` added | `resi-lost`, entry requires a reason |
| Commercial `Won` / `Lost` added | `comm-won`, `comm-lost` |
| Commercial `On-Hold` reclassified | `paused`, no longer the terminal column |
| Biz Dev `Lost` added | `bizdev-lost`; `First Meeting` is the win — the deal continues elsewhere |
| Partner `Declined` added | `partner-lost`; `Active Referrer` = won, `Dormant` = paused |
| New Leads `Lost` added | `newleads-lost`; `Estimate Booked` = won, `Nurture` = paused |
| `lostReason` + `lostAt` | Required on entry to any `lost` stage |
| `revisitDate` | On paused deals |
| Validation | A pipeline cannot be saved without ≥1 `won` and ≥1 `lost` |

`booked` and `parked` survive unchanged as dispositions **within** `Won`,
including their metric-strip rendering.

## Conflict 2 — neglect

- Precedence, most specific wins: `stage.neglectDays` → `pipeline.neglect_days`
  → `DEFAULT_NEGLECT_DAYS`. The reasoned 14 / 45 pipeline values are unchanged.
- `paused`, `won` and `lost` stages are excluded from neglect entirely.
- Paused deals come due via `revisitDate`, as a separate "revisit due" signal.

## Styling and reporting no longer key off ids

The hardcoded *"stages `result`, `negotiation`, `active`, `meeting` get a green
border"* rule is gone, along with the id-keyed On-Hold and Dormant colours.
Column borders, title colours, win rate, roll-ups and neglect all derive from
`semanticType`. A franchise inventing "Awaiting Permit" tags it `paused` and
everything works with no code change. No new colour ramps: `paused` reuses the
existing amber, `lost` the existing dusty.

---

## Fixtures changed

| Fixture | Change |
|---|---|
| `r12` Colm Ferreira | **New.** Residential, `resi-lost`, `lostReason: price`, `lostAt` Dec 2025 — eight months back, so the Lost-Lead Revival trigger has a real target for the first time |
| `r8` Lorna Kirkbride | Unchanged. Still `result` (now Won), disposition `booked`, `EST-40218` |
| `r9` Simone Achterberg | Unchanged. Still `result` (now Won), disposition `parked`, retry Spring 2027 |
| `c6` Eckington Lofts | `revisitDate` Jan 2027 added; stage reclassified `paused` |
| `p5` Tanager Interiors | Stage `dormant` reclassified `paused`; `revisitDate` 14 Sept 2026 backfilled |

Stage count 19 → 30. Deal count 32 → 33.

## Neglected-deals count

**4**, from `getNeglectedDeals()`: `r11` (22d), `b4` (21d), `r4` (19d),
`n2` (1d, against the New Leads one-day threshold). Every paused deal now
carries a revisit date and every lost deal a reason, so no deal sits on
neither list.

Previously 3. The membership changed more than the number: `p5` dropped out
under the new `paused` exclusion, and `r11` and `n2` entered from fixtures
added since. `r2` and `r6` read as long-silent but are correctly excluded by
the "no on-time next action booked" clause — a raw threshold query without that
clause returns 9, which is why the figure above comes from the repository
function rather than hand-written SQL.

---

## Open items

**1. ~~A paused deal with no revisit date is invisible.~~ Closed.** Excluding
paused stages from neglect briefly opened a false negative on the worst deal on
the board: `p5` at 152 days silent, in a `paused` stage with no revisit date —
excluded from neglect, and nothing to fire the replacement rule. On no list at
all. We had removed a false positive and taken a false negative in exchange,
which is the worse half of the trade: a noisy alert gets ignored, a missing one
gets trusted.

Closed on both sides. `stageRequiresRevisitDate` makes the date mandatory on
entry to a paused stage, symmetric with requiring a reason on `lost` — a lost
deal must say why, a parked deal must say when. Grounded in addendum §3.2,
which defines paused as *"live but on hold (needs revisit date)"*. And
`revisitState()` returns a distinct `"no-date"` so a row predating the rule is
nameable rather than silent. `p5` was backfilled to 14 Sept 2026.

A test asserts the invariant across every pipeline: **a paused stage both
requires a revisit date and is excluded from neglect.** Those two facts have to
travel together, or removing one and not the other reopens the gap.

**2. Neglect resolution order is not visible anywhere.** The reconciliation
asks for it to be legible in Pipeline Settings. That screen does not exist —
it is the third outstanding addendum item (§3.6). Deferred rather than given an
invented home.

## Inferences flagged

The reconciliation says to apply outcome stages "anywhere else a pipeline lacks
an explicit won or lost terminal stage" but does not say what those are for
each pipeline. These are judgement calls, not instructions:

- **Partner** — `Active Referrer` = `won`, `Dormant` = `paused`, new `Declined`
  = `lost`. A quiet partner is revivable, which is the point of tracking them,
  so dormancy reads as paused rather than lost. If Dormant should be `lost`,
  that is a one-line change.
- **Biz Dev** — `First Meeting` = `won`. The hand-off *is* the win; the deal
  continues its life in Commercial or Residential.
- **New Leads** — `Estimate Booked` = `won`, `Nurture` = `paused`.

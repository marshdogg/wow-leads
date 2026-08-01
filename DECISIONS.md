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

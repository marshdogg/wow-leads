# Reconciliation task — outcome model + neglect thresholds

Two documents in this repo give conflicting instructions. Implement the reconciliation below rather than
following either document alone.

## Where the files are

All paths are relative to the project root (`~/Desktop/WOW Leads`):

| File | What it is |
|---|---|
| `DECISIONS.md` | The build's decisions log. **Conflicting items: "Open questions resolved" #2 (Residential Result) and #3 (neglect threshold).** |
| `WOW-Leads-v3-Review-and-Addendum.md` | Review of the v3 design. **Relevant: the STATUS block at the top, §2.2, §2.3, §3.2, §3.3.** |
| `CLI-Prompt-v4.md` | The v4 build instruction (semantic stage types, Won/Lost, Pipeline Settings). |
| `design-refs/README.md` | Original v3 design handoff — data model, screens, tokens. |
| `BUILD-PROMPT.md` | The original one-pass build brief. |

---

## Conflict 1 — Residential has no Lost outcome

**`DECISIONS.md` #2** resolves the Residential `Result` stage into two sub-outcomes: `booked` (carries an
`osRef`) and `parked` (carries a retry date).

**`WOW-Leads-v3-Review-and-Addendum.md` §2.2–2.3** requires every pipeline to terminate in at least one
`won` and one `lost` stage, with a structured `lostReason` + `lostAt` required on any lost transition.

Both cannot hold. Neither `booked` nor `parked` is a loss, so today a Residential re-marketing lead that
says "never contact me again" has nowhere to go. Consequences: Residential win rate is uncomputable, and
the Lost-Lead Revival trigger (`lostReason = price` + 6 months) has no Residential path — which matters,
because reviving dead residential leads is one of the motivating use cases.

### Resolve as follows — keep both, they're describing different axes

`DECISIONS.md` #2 conflated **outcome** (did we win or lose?) with **disposition** (what happens next?).
Separate them:

- **Outcome** is the stage's `semanticType`: `won` | `lost` (plus `open` / `positive` / `paused` for
  non-terminal stages). This drives win-rate maths, roll-up reporting and styling.
- **Disposition** is the existing sub-outcome on the deal: `booked` (has `osRef`) | `parked` (has retry
  date). This is display detail on the card's metric strip.

Concretely for the Residential pipelines:

1. Split `Result` into **`Won`** (`semanticType: won`) and **`Lost`** (`semanticType: lost`).
2. Keep the `booked` / `parked` sub-outcome. Both are dispositions **within `Won`** — a re-marketing touch
   that lands an estimate (`booked`) and one that earns a committed retry date (`parked`) are both
   successful outcomes of the touch. Preserve the existing metric-strip rendering that distinguishes them,
   and preserve the seeded examples (Lorna Kirkbride → booked, EST-40218; Simone Achterberg → parked,
   retry Spring 2027).
3. `Lost` is new and currently unpopulated. Entering it requires `lostReason`
   (`not interested | unqualified | price | timing | competitor | no response | other`) and sets `lostAt`.
   Seed at least one Residential deal as lost-on-price with a `lostAt` older than six months so the revival
   trigger has something to fire on and the flow is demonstrable.
4. Apply the same treatment anywhere else a pipeline lacks an explicit `won` or `lost` terminal stage —
   Commercial's `On-Hold` must become a parallel `paused` state with a `revisitDate`, not the terminal
   column (addendum §2.2).
5. Enforce the validation from addendum §3.4: a pipeline cannot be saved without at least one `won` and one
   `lost` stage. That rule is what prevents this class of gap recurring.

Update `DECISIONS.md` #2 to record the outcome-vs-disposition split and note that it supersedes the
original resolution.

---

## Conflict 2 — neglect thresholds vs. paused stages

**`DECISIONS.md` #3** stores neglect as `pipelines.neglect_days`: 14 days for Residential / Biz Dev /
Partner, 45 for Commercial, on the reasoning that commercial bid cycles run months.

**`WOW-Leads-v3-Review-and-Addendum.md` §3.3** specifies an optional per-**stage** `neglectDays` override,
and §3.2 excludes `paused` stages from neglect alerts entirely.

These layer rather than conflict, but they must be reconciled deliberately or the per-pipeline value will
be silently overridden — and there is a real defect in the current behaviour:

> A Commercial bid moved to On-Hold with a revisit date six months out still trips the 45-day rule. It is
> flagged as neglected while sitting exactly where someone deliberately put it. That is a false positive by
> design, and it's the failure mode that trains people to ignore the alert.

### Resolve as follows

1. **Precedence, most specific wins:** `stage.neglectDays` (if set) → `pipeline.neglect_days` → global
   default. Keep the resolved 14 / 45 values as the pipeline-level defaults; they were correctly reasoned.
2. **Stages with `semanticType: paused` are excluded from neglect entirely**, regardless of any threshold.
   A paused deal is not neglected — it is parked on purpose.
3. **Stages with `semanticType: won` or `lost` are excluded**, being closed.
4. **For paused stages, `revisitDate` replaces the neglect rule.** A paused deal becomes actionable when
   its revisit date passes, surfaced as its own signal ("revisit due"), distinct from neglect. Show it in
   the same place the manager dashboard shows neglected deals, visually separate.
5. Expose the resolution order in the Pipeline Settings screen so it's legible that a stage override beats
   the pipeline default.

Note the knock-on: `DECISIONS.md` logs that "Neglected deals shows 3, not 4" because `c3` (Ivy City
Warehouse, 16 days silent) falls under the 45-day Commercial threshold. That reasoning still stands — but
recheck the count after implementing the exclusions above, since any deal now sitting in a `paused`, `won`
or `lost` stage drops out too. Update that divergence note with the new number and why.

---

## Deliverables

1. The changes above, implemented.
2. `DECISIONS.md` updated — revise resolved-questions #2 and #3 in place, each with a line noting what
   superseded the original reasoning and why. Do not delete the original reasoning; this doc is the
   project's reasoning record.
3. A note in the changelog listing any seeded fixture that changed, and the new neglected-deals count.

Flag anything you can't resolve from these documents rather than guessing.

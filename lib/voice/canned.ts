/**
 * The prototype's canned walkthrough transcript.
 *
 * Used whenever the Web Speech API is unavailable or errors out (Firefox, some
 * Safari builds, headless Playwright) so the screen still demos and e2e runs
 * stay deterministic. Never let a missing browser API break the flow.
 */
export const CANNED_TRANSCRIPT =
  "Just finished walking Delia's place. The stairwell and hallway are scuffed like she said, " +
  "and she now wants the two upstairs bedrooms done as well. She's asking about the same " +
  "off-white, Benjamin Moore, and wants it done before her daughter's wedding in October. " +
  "Told her I'd get an estimator out this week.";

/** What the listening state shows before any real interim result arrives. */
export const CANNED_INTERIM =
  "Just finished walking Delia's place — the stairwell and hallway are…";

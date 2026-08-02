import { expect, test } from "@playwright/test";

/**
 * The outcome model: every pipeline can say how a deal ended, entering a lost
 * stage demands a reason, and a paused deal is watched by its revisit date
 * rather than by the neglect rule.
 */

test("entering a Lost stage demands a reason before the move completes", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=board");

  const lost = page.getByTestId("column-resi-lost");
  await expect(lost).toBeVisible();
  const won = page.getByTestId("column-result");
  await expect(won).toContainText("Lorna Kirkbride");

  // Keyboard rather than a synthetic mouse drag: same onDragEnd path,
  // deterministic in CI, and it doubles as an accessibility check. A7 also
  // found that dropping on the rightmost column auto-scrolls the strip, which
  // makes a following synthetic mouse drag start on nothing.
  //
  // Lorna sits in Won, one column left of Lost, so this is a single-column
  // move. dnd-kit's keyboard sensor steps by pixels rather than by column, so
  // press until the live region names the target instead of guessing a count.
  const handle = page.getByLabel(/^Lorna Kirkbride\. Press space to pick up/);
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press("Space");

  const live = page.locator("[aria-live]").first();
  await expect
    .poll(
      async () => {
        await page.keyboard.press("ArrowRight");
        return (await live.textContent()) ?? "";
      },
      { timeout: 20_000, intervals: [120] },
    )
    .toContain("droppable area resi-lost");
  await page.keyboard.press("Space");

  const modal = page.getByTestId("lost-reason-modal");
  await expect(modal).toBeVisible();

  // Nothing is recorded until a reason is chosen — the reason is what the
  // revival trigger keys off, so a blank makes the automation useless.
  await expect(page.getByTestId("lost-reason-confirm")).toBeDisabled();

  // Cancelling leaves the card where it was rather than springing it back.
  await page.getByTestId("lost-reason-cancel").click();
  await expect(modal).toBeHidden();

  // Cancelling leaves the card where it was rather than springing it back —
  // a card that lands in Lost and returns reads as a failed drag rather than
  // an unanswered question. Asserted on the card, not on the column's whole
  // text, which changes for reasons unrelated to this move.
  await expect(won).toContainText("Lorna Kirkbride");
  await expect(lost).not.toContainText("Lorna Kirkbride");
});

test("a paused deal is watched by its revisit date, not by neglect", async ({
  page,
}) => {
  await page.goto("/manager");

  // Paused stages are excluded from neglect — a bid parked on purpose is not
  // neglected — so the revisit panel is where they surface instead.
  await expect(page.getByTestId("revisit-due-panel")).toBeVisible();
  await expect(page.getByTestId("neglected-count")).toBeVisible();

  // The two are separate signals and must not be merged: they mean different
  // things to whoever is reading the dashboard.
  const neglected = page.getByTestId("neglected-row-c6");
  await expect(neglected).toHaveCount(0);
});

test("every pipeline terminates in explicit Won and Lost stages", async ({
  page,
}) => {
  // The gap that let Commercial ship ending in On-Hold, which made its win
  // rate uncomputable. Addendum §2.2.
  const outcomes: Record<string, [string, string]> = {
    resi: ["column-result", "column-resi-lost"],
    comm: ["column-comm-won", "column-comm-lost"],
    bizdev: ["column-meeting", "column-bizdev-lost"],
    partner: ["column-active", "column-partner-lost"],
    newleads: ["column-booked", "column-newleads-lost"],
  };

  for (const [pipe, [won, lost]] of Object.entries(outcomes)) {
    await page.goto(`/board?pipeline=${pipe}&view=board`);
    await expect(page.getByTestId(won)).toBeVisible();
    await expect(page.getByTestId(lost)).toBeVisible();
  }
});

test("On-Hold is a parallel paused state, not the terminal column", async ({
  page,
}) => {
  await page.goto("/board?pipeline=comm&view=board");
  await expect(page.getByTestId("column-hold")).toBeVisible();
  // Outcomes come after it — it is no longer where a bid ends up.
  await expect(page.getByTestId("column-comm-won")).toBeVisible();
  await expect(page.getByTestId("column-comm-lost")).toBeVisible();
});

test("pausing a deal prompts for a revisit date and completes", async ({
  page,
}) => {
  /**
   * This case exists because the paused path was completely broken and stayed
   * green. The repository throws when a paused stage is entered without a
   * revisit date, and for a while nothing in the UI collected one — so every
   * pause bounced and On-Hold, a state the addendum specifically promotes to a
   * first-class parallel stage, was unreachable from the board. The predicate
   * and the throw were both unit-tested and both passed; nothing drove the
   * interaction end to end.
   */
  await page.goto("/board?pipeline=comm&view=board");

  const hold = page.getByTestId("column-hold");
  const negotiation = page.getByTestId("column-negotiation");
  await expect(negotiation).toContainText("Union Market");

  // Negotiation sits one column left of On-Hold, so this is a single-column
  // move. The keyboard sensor steps by pixels rather than by column, so press
  // until the live region names the target.
  const handle = page.getByLabel(/^Union Market — 3 suites\. Press space/);
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press("Space");

  const live = page.locator("[aria-live]").first();
  await expect
    .poll(
      async () => {
        await page.keyboard.press("ArrowRight");
        return (await live.textContent()) ?? "";
      },
      { timeout: 20_000, intervals: [120] },
    )
    .toContain("droppable area hold");
  await page.keyboard.press("Space");

  const modal = page.getByTestId("revisit-date-modal");
  await expect(modal).toBeVisible();

  // A pause takes the deal off the neglect alert, and the date is the only
  // thing that puts it back — so it cannot be skipped.
  await expect(page.getByTestId("revisit-date-confirm")).toBeDisabled();

  await page.getByTestId("revisit-preset-90").click();
  await expect(page.getByTestId("revisit-date-confirm")).toBeEnabled();
  await page.getByTestId("revisit-date-confirm").click();

  await expect(modal).toBeHidden();
  await expect(hold).toContainText("Union Market");
  await expect(page.getByTestId("toast")).toContainText("Union Market");
});

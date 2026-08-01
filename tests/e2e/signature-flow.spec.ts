import { expect, test } from "@playwright/test";

/**
 * The signature flow, end to end:
 *
 *   trigger fires → draft appears in Approvals with a populated
 *   "WHY THIS FIRED" → approve → the AI DRAFTED chip clears on the board →
 *   toast → rep logs the outcome in Field → the Record timeline shows full
 *   provenance → book → the deal lands in Result with the WOW OS footer.
 *
 * This is the one test that must never be allowed to rot: it is the product
 * claim. Deal `r1` (Delia Marchetti) is the canonical subject.
 */
test("trigger → approve → field log → provenance → book", async ({ page }) => {
  // --- The draft is waiting, with real reasons ------------------------------
  await page.goto("/approvals");

  const draft = page.getByTestId("approval-a1");
  await expect(draft).toBeVisible();
  await expect(draft).toContainText("Delia Marchetti");
  await expect(draft).toContainText("WHY THIS FIRED");
  await expect(draft).toContainText(
    "Job completed 11 months ago — inside the warranty-inspection window",
  );
  // The reasons must be derived facts, not an empty shell.
  await expect(draft.getByTestId("approval-reason")).toHaveCount(4);

  // --- Approve --------------------------------------------------------------
  await draft.getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByTestId("toast")).toContainText(
    "Sent and logged with agent provenance",
  );
  await expect(page.getByTestId("approval-a1")).toBeHidden();

  // --- The AI DRAFTED chip clears on the board ------------------------------
  await page.goto("/board?pipeline=resi&view=board");
  const card = page.getByTestId("lead-card-r1");
  await expect(card).toBeVisible();
  await expect(card.getByText("AI DRAFTED")).toHaveCount(0);

  // --- A rep logs the outcome in the field ----------------------------------
  await page.goto("/field");
  await page.getByTestId("voice-toggle").click();
  await page.getByTestId("voice-toggle").click();
  await expect(page.getByTestId("voice-fields")).toBeVisible();
  await page.getByTestId("voice-save").click();

  // --- The record shows the full provenance timeline ------------------------
  await page.goto("/record/r1");
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toBeVisible();
  // Agent-performed and person-performed entries are both present and
  // distinguishable — that distinction is the point of the screen.
  await expect(timeline.getByTestId("timeline-agent").first()).toBeVisible();
  await expect(timeline.getByTestId("timeline-human").first()).toBeVisible();
  await expect(timeline).toContainText("Warranty check-in");

  // --- Book: the deal lands in Result with the WOW OS footer ----------------
  await page.getByRole("button", { name: /Book Estimate/i }).click();
  const booking = page.getByTestId("booking-modal");
  await expect(booking).toBeVisible();
  await booking.getByTestId("booking-day-1").click();
  await booking.getByTestId("booking-time-1").click();
  await booking.getByTestId("booking-estimator-0").click();
  await booking.getByRole("button", { name: /Confirm|Book/i }).click();
  await expect(booking).toContainText("One record, now in the Funnel");
  await expect(booking).toContainText(/EST-\d{5}/);

  await page.goto("/board?pipeline=resi&view=board");
  const booked = page.getByTestId("lead-card-r1");
  await expect(booked).toContainText("Linked in WOW OS");
  await expect(page.getByTestId("column-result")).toContainText(
    "Delia Marchetti",
  );
});

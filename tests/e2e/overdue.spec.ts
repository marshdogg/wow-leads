import { expect, test } from "@playwright/test";

/**
 * Overdue is the one state a rep must never miss, so it is asserted on the
 * actual computed styles rather than on a class name. Deal `r4` (Grant
 * Whitfield, "Was due 5 days ago") is the canonical overdue lead.
 */

const RED_TEXT = "rgb(240, 162, 148)"; // #f0a294
const RED_RAIL = "rgb(140, 58, 48)"; // #8c3a30
const RED_BG = "rgb(30, 16, 14)"; // #1e100e
const RED_BORDER = "rgb(92, 38, 32)"; // #5c2620

test("an overdue card renders in the red tone", async ({ page }) => {
  await page.goto("/board?pipeline=resi&view=board");

  const card = page.getByTestId("lead-card-r4");
  await expect(card).toBeVisible();

  const next = card.getByTestId("next-action");
  await expect(next).toContainText("Was due 5 days ago");
  await expect(next).toHaveCSS("background-color", RED_BG);
  await expect(next).toHaveCSS("border-color", RED_BORDER);
  await expect(card.getByTestId("stale")).toHaveCSS("color", RED_TEXT);
});

test("an overdue row renders in the red tone with the correct rail", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=list");

  const row = page.getByTestId("list-row-r4");
  await expect(row).toBeVisible();
  await expect(row.getByTestId("row-accent")).toHaveCSS(
    "background-color",
    RED_RAIL,
  );
  await expect(row.getByTestId("row-next")).toHaveCSS("color", RED_TEXT);
  await expect(row.getByTestId("row-stale")).toHaveCSS("color", RED_TEXT);

  await expect(page.getByTestId("list-footer")).toContainText("overdue");
});

test("an AI-drafted row gets the green rail and the tinted background", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=list");

  const row = page.getByTestId("list-row-r1");
  await expect(row.getByTestId("row-accent")).toHaveCSS(
    "background-color",
    "rgb(126, 211, 33)", // #7ed321
  );
  await expect(row).toHaveCSS("background-color", "rgb(15, 19, 14)"); // #0f130e
});

import { expect, test } from "@playwright/test";

/**
 * Two things the prototype could fake and the product cannot: a dragged card
 * must still be where you left it after a reload, and collapse state plus list
 * sort must survive as per-user preferences.
 */

test("a card dragged between columns stays there after reload", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=board");

  const card = page.getByTestId("lead-card-r2");
  const target = page.getByTestId("column-first");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("column-past")).toContainText("Ondrej Vasek");

  // dnd-kit needs intermediate moves to register a drag.
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("card or target column not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 20 });
  await page.mouse.move(to.x + to.width / 2, to.y + 100, { steps: 10 });
  await page.mouse.up();

  await expect(target).toContainText("Ondrej Vasek");

  await page.reload();
  await expect(page.getByTestId("column-first")).toContainText("Ondrej Vasek");
  await expect(page.getByTestId("column-past")).not.toContainText(
    "Ondrej Vasek",
  );
});

test("collapse state and list sort persist across a reload", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=board");

  await page.getByTestId("column-collapse-past").click();
  await expect(page.getByTestId("column-past")).toHaveAttribute(
    "data-collapsed",
    "true",
  );

  await page.goto("/board?pipeline=resi&view=list");
  await page.getByTestId("list-head-name").click();
  await expect(page.getByTestId("list-head-name")).toHaveAttribute(
    "data-sort",
    "asc",
  );

  await page.reload();
  await expect(page.getByTestId("list-head-name")).toHaveAttribute(
    "data-sort",
    "asc",
  );

  await page.goto("/board?pipeline=resi&view=board");
  await expect(page.getByTestId("column-past")).toHaveAttribute(
    "data-collapsed",
    "true",
  );
});

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

  // Driven through dnd-kit's keyboard sensor rather than a simulated mouse
  // drag: it is the same `onDragEnd` path, it is deterministic in CI, and it
  // doubles as the assertion that the board is keyboard-accessible.
  // The draggable is the wrapper *around* the card, so it is addressed by the
  // aria-label dnd-kit exposes rather than by the card's own test id.
  const handle = page.getByLabel(/^Ondrej Vasek\. Press space to pick up/);
  await expect(handle).toBeVisible();

  // dnd-kit's listeners attach on hydration, but the server-rendered markup
  // already carries role="button" and tabindex, so the card looks interactive
  // before it is. Retry the pick-up until dnd-kit's live region acknowledges
  // it; a redundant Space just drops the card where it already is.
  const liveRegion = page.locator("[aria-live]").first();
  await expect
    .poll(
      async () => {
        await handle.focus();
        await page.keyboard.press("Space");
        return (await liveRegion.textContent()) ?? "";
      },
      { timeout: 20_000 },
    )
    .toContain("was moved over droppable area");

  await page.keyboard.press("ArrowRight");
  await expect(liveRegion).toContainText("droppable area first");
  await page.keyboard.press("Space");

  await expect(target).toContainText("Ondrej Vasek", { timeout: 20_000 });

  // The assertion above is satisfied by the optimistic update alone. The toast
  // only fires once the server action has resolved, so wait for it before
  // reloading — otherwise the reload races the write and reads the old stage.
  await expect(page.getByTestId("toast")).toContainText("Ondrej Vasek", {
    timeout: 20_000,
  });

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

  // Preferences persist per user, so a previous run may have left this
  // collapsed. Drive to a known state rather than assuming the default.
  const column = page.getByTestId("column-past");
  if ((await column.getAttribute("data-collapsed")) === "true") {
    await page.getByTestId("column-collapse-past").click();
    await expect(column).toHaveAttribute("data-collapsed", "false");
  }
  await page.getByTestId("column-collapse-past").click();
  await expect(column).toHaveAttribute("data-collapsed", "true");

  await page.goto("/board?pipeline=resi&view=list");
  const head = page.getByTestId("list-head-name");
  // Sort direction persists per user, so drive to ascending rather than
  // assuming a default — waiting for each click to settle before re-reading.
  for (let i = 0; i < 3; i++) {
    if ((await head.getAttribute("data-sort")) === "asc") break;
    const before = await head.getAttribute("data-sort");
    await head.click();
    await expect
      .poll(() => head.getAttribute("data-sort"), { timeout: 15_000 })
      .not.toBe(before);
  }
  await expect(head).toHaveAttribute("data-sort", "asc");

  // Preferences are written by a server action the click doesn't await, so a
  // reload can outrun the write. The guarantee under test is that the choice
  // *eventually* survives a reload, so the reload itself is part of the poll
  // rather than a single shot that races the round trip.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByTestId("list-head-name").getAttribute("data-sort");
      },
      // Generous on purpose. The write is fire-and-forget from the client and
      // lands on a shared Neon instance whose latency varies a lot under load
      // — a slow round trip is not the failure this test is looking for.
      { timeout: 60_000, intervals: [500, 1000, 2000, 4000] },
    )
    .toBe("asc");

  await expect
    .poll(
      async () => {
        await page.goto("/board?pipeline=resi&view=board");
        return page.getByTestId("column-past").getAttribute("data-collapsed");
      },
      // Generous on purpose. The write is fire-and-forget from the client and
      // lands on a shared Neon instance whose latency varies a lot under load
      // — a slow round trip is not the failure this test is looking for.
      { timeout: 60_000, intervals: [500, 1000, 2000, 4000] },
    )
    .toBe("true");

  // Leave the account as we found it — these are real persisted preferences.
  await page.getByTestId("column-collapse-past").click();
  await expect(page.getByTestId("column-past")).toHaveAttribute(
    "data-collapsed",
    "false",
  );
});

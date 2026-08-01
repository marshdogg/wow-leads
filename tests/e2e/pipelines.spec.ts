import { expect, test } from "@playwright/test";

/**
 * The board is pipeline-generic. Each pipeline renders its own stages, metrics
 * and KPIs, and no stage from one pipeline ever leaks into another — that is
 * the claim the Switcher screen exists to prove, so it gets a hard gate.
 */

const PIPELINES = [
  {
    id: "resi",
    title: "Residential Re-marketing",
    stages: ["past", "first", "second", "promo", "followed", "result"],
    kpi: "Eligible past customers",
  },
  {
    id: "comm",
    title: "Commercial Bid",
    stages: [
      "prospect",
      "invited",
      "takeoff",
      "submitted",
      "negotiation",
      "hold",
    ],
    kpi: "Active bid value",
  },
  {
    id: "bizdev",
    title: "Biz Dev / Prospecting",
    stages: ["initial", "followup", "meeting"],
    kpi: "Contacts in sequence",
  },
  {
    id: "partner",
    title: "Industry Partner network",
    stages: ["identified", "introduced", "active", "dormant"],
    kpi: "Active referrers",
  },
];

const ALL_STAGES = PIPELINES.flatMap((p) => p.stages);

for (const pipe of PIPELINES) {
  test(`${pipe.id} renders only its own stages, metrics and KPIs`, async ({
    page,
  }) => {
    await page.goto(`/board?pipeline=${pipe.id}&view=board`);

    await expect(page.getByTestId("board-title")).toHaveText(pipe.title);
    await expect(page.getByTestId("kpi-strip")).toContainText(pipe.kpi);

    for (const stage of pipe.stages) {
      await expect(page.getByTestId(`column-${stage}`)).toBeVisible();
    }
    // No cross-pipeline stage leakage.
    for (const stage of ALL_STAGES.filter((s) => !pipe.stages.includes(s))) {
      await expect(page.getByTestId(`column-${stage}`)).toHaveCount(0);
    }
  });
}

test("Commercial columns show a $ in stage roll-up, others do not", async ({
  page,
}) => {
  await page.goto("/board?pipeline=comm&view=board");
  await expect(page.getByTestId("stage-total-submitted")).toContainText(
    /\$\d+K in stage/,
  );

  await page.goto("/board?pipeline=resi&view=board");
  await expect(page.getByTestId("stage-total-past")).toHaveCount(0);
});

test("the track filter is Residential-only and resets on pipeline change", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=board");
  await expect(page.getByTestId("track-filter")).toBeVisible();
  await page.getByTestId("track-revival").click();
  await expect(page.getByTestId("column-second")).not.toContainText(
    "Grant Whitfield",
  );

  await page.getByTestId("pipeline-comm").click();
  await expect(page.getByTestId("track-filter")).toHaveCount(0);

  await page.getByTestId("pipeline-resi").click();
  await expect(page.getByTestId("track-all")).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("the Switcher renders Commercial, Biz Dev and Partner", async ({
  page,
}) => {
  await page.goto("/switcher");
  for (const id of ["comm", "bizdev", "partner"]) {
    await page.getByTestId(`switcher-${id}`).click();
    const pipe = PIPELINES.find((p) => p.id === id)!;
    for (const stage of pipe.stages) {
      await expect(page.getByTestId(`column-${stage}`)).toBeVisible();
    }
  }
});

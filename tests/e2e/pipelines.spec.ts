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
  {
    id: "newleads",
    title: "New Leads",
    stages: ["new", "contacted", "qualified", "booked", "nurture"],
    kpi: "",
  },
];

const ALL_STAGES = PIPELINES.flatMap((p) => p.stages);

for (const pipe of PIPELINES) {
  test(`${pipe.id} renders only its own stages, metrics and KPIs`, async ({
    page,
  }) => {
    await page.goto(`/board?pipeline=${pipe.id}&view=board`);

    await expect(page.getByTestId("board-title")).toHaveText(pipe.title);
    if (pipe.kpi) {
      await expect(page.getByTestId("kpi-strip")).toContainText(pipe.kpi);
    }

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

test("the track filter appears only on tracked pipelines and resets on change", async ({
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

test("track options are per-pipeline, and New Leads opts out entirely", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=board");
  const resiFilter = page.getByTestId("track-filter");
  await expect(resiFilter).toContainText("Repeat work");
  await expect(resiFilter).toContainText("Revival");

  // New Leads surfaces the source as a card metric and filters it from the
  // dropdown, so it has no track control at all — not an empty one.
  await page.goto("/board?pipeline=newleads&view=board");
  await expect(page.getByTestId("track-filter")).toHaveCount(0);
  await expect(page.getByTestId("board-category")).toHaveText(
    "RESIDENTIAL LEADS",
  );
  await expect(page.getByTestId("board-title")).toHaveText("New Leads");
});

test("a job-site lead links back to the job that produced it", async ({
  page,
}) => {
  // The linkage is the business case for canvassing around active job sites,
  // so the round trip is asserted rather than the fixture count — how many
  // neighbour leads the demo carries is a seed choice, not behaviour.
  await page.goto("/manager");
  const attribution = page.getByTestId("job-site-attribution");
  await expect(attribution).toBeVisible();
  await attribution.getByTestId("attribution-top-job").click();

  const sourced = page.getByTestId("sourced-leads");
  await expect(sourced).toBeVisible();
  const rows = sourced.getByTestId("sourced-lead-row");
  expect(await rows.count()).toBeGreaterThan(0);

  // The job's address, so the lead's origin line can be checked against it.
  const jobAddress = (await page.getByTestId("account-line").innerText()).trim();

  await rows.first().click();
  await expect(page.getByTestId("sourced-from")).toContainText(
    jobAddress.split(" ")[0],
  );
});

test("a record with no job origin renders neither attribution panel", async ({
  page,
}) => {
  // Absent from the DOM, not present-and-empty: a regression that rendered an
  // empty "Leads from this job" panel on all 25 ordinary records would
  // otherwise pass silently.
  await page.goto("/record/r1");
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("sourced-leads")).toHaveCount(0);
  await expect(page.getByTestId("sourced-from")).toHaveCount(0);
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

test("the never-quoted track separates contacts on file from past customers", async ({
  page,
}) => {
  await page.goto("/board?pipeline=resi&view=board");
  // The stage is no longer called "Past Customer": half the column now holds
  // people who have never had a job with us.
  await expect(page.getByTestId("column-past")).toContainText("Eligible");
  await expect(page.getByTestId("track-neverquoted")).toBeVisible();

  await page.getByTestId("track-neverquoted").click();
  const cards = page.locator('[data-testid^="lead-card-r"]');
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("NEVER QUOTED").first()).toBeVisible();
  // A never-quoted lead has no price to reference — that is the whole point.
  await expect(page.getByTestId("lead-card-r10")).toContainText("Never");
});

test("the New Leads source filter narrows the board", async ({ page }) => {
  await page.goto("/board?pipeline=newleads&view=board");
  const cards = page.locator('[data-testid^="lead-card-n"]');
  await expect(cards).toHaveCount(5);

  const filter = page.getByTestId("source-filter");
  await filter.selectOption("Landing Page");
  await expect(cards).toHaveCount(1);

  await filter.selectOption("Facebook Ads");
  await expect(cards).toHaveCount(1);

  await filter.selectOption("all");
  await expect(cards).toHaveCount(5);
});

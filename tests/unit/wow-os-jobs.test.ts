import { describe, expect, it } from "vitest";
import {
  InMemoryWowOsClient,
  MemoryEstimateStore,
  MemoryJobStore,
} from "@/lib/wow-os/client";
import {
  isSeededJobRef,
  jobCompletedPayloadSchema,
  toUpsertInput,
} from "@/lib/wow-os/jobs";
import { isAuthorisedBearer, safeEqual } from "@/lib/wow-os/auth";
import type { CompletedJob } from "@/lib/campaigns/types";

const VALID = {
  jobId: "WO-88421",
  accountId: "acc-marchetti",
  dealId: "r1",
  completedAt: "2026-07-28T16:40:00Z",
  workType: "interior",
  scope: "4 rooms, hallway, stairwell",
  areas: ["living room", "hallway", "stairwell"],
  valueCents: 840000,
  crew: "Dani Koval",
};

/* -------------------------------------------------------------------------
   Payload validation
   ------------------------------------------------------------------------- */

describe("job-completed payload", () => {
  it("accepts the documented example", () => {
    const parsed = jobCompletedPayloadSchema.parse(VALID);
    expect(parsed.jobId).toBe("WO-88421");
    expect(parsed.completedAt).toBeInstanceOf(Date);
    expect(parsed.completedAt.toISOString()).toBe("2026-07-28T16:40:00.000Z");
  });

  it("treats dealId and crew as optional", () => {
    const parsed = jobCompletedPayloadSchema.parse({
      ...VALID,
      dealId: undefined,
      crew: undefined,
    });
    expect(toUpsertInput(parsed).dealId).toBeNull();
    expect(toUpsertInput(parsed).crew).toBeNull();
  });

  it("defaults scope and areas so a sparse payload still lands", () => {
    const parsed = jobCompletedPayloadSchema.parse({
      jobId: "WO-1",
      accountId: "acc-1",
      completedAt: "2026-07-01T00:00:00Z",
      workType: "exterior",
      valueCents: 0,
    });
    expect(parsed.scope).toBe("");
    expect(parsed.areas).toEqual([]);
  });

  it("rejects a completion dated in the future", () => {
    const ahead = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const r = jobCompletedPayloadSchema.safeParse({
      ...VALID,
      completedAt: ahead,
    });
    expect(r.success).toBe(false);
  });

  it("tolerates small clock skew", () => {
    const skew = new Date(Date.now() + 60 * 1000).toISOString();
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, completedAt: skew })
        .success,
    ).toBe(true);
  });

  it("rejects a non-integer or negative value", () => {
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, valueCents: 840000.5 })
        .success,
    ).toBe(false);
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, valueCents: -1 }).success,
    ).toBe(false);
  });

  it("rejects an unknown work type", () => {
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, workType: "roofing" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing jobId — it is the idempotency key", () => {
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, jobId: "" }).success,
    ).toBe(false);
    const { jobId: _omit, ...without } = VALID;
    expect(jobCompletedPayloadSchema.safeParse(without).success).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, completedAt: "soon" })
        .success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------
   Idempotency key
   ------------------------------------------------------------------------- */

describe("toUpsertInput", () => {
  it("carries the Funnel ref as data, not as our primary key", () => {
    // `upsertCompletedJob` conflicts on `wow_os_job_id` and generates the id
    // itself, so nothing here derives a key from the ref.
    const input = toUpsertInput(jobCompletedPayloadSchema.parse(VALID));
    expect(input.wowOsJobId).toBe("WO-88421");
    expect(input).not.toHaveProperty("id");
  });

  it("maps every field through unchanged", () => {
    const input = toUpsertInput(jobCompletedPayloadSchema.parse(VALID));
    expect(input).toEqual({
      wowOsJobId: "WO-88421",
      accountId: "acc-marchetti",
      dealId: "r1",
      completedAt: new Date("2026-07-28T16:40:00Z"),
      workType: "interior",
      scope: "4 rooms, hallway, stairwell",
      areas: ["living room", "hallway", "stairwell"],
      valueCents: 840000,
      crew: "Dani Koval",
    });
  });
});

describe("the seed: prefix stays reserved", () => {
  it("rejects a Funnel ref that would masquerade as seed data", () => {
    // Seeded rows are `seed:job-r1`. `getJobCompletionStats()` counts anything
    // `seed:` as not-from-the-Funnel, so a real ref using the prefix would
    // under-report live ingest — the one number that says whether the
    // integration is actually running.
    const r = jobCompletedPayloadSchema.safeParse({
      ...VALID,
      jobId: "seed:job-r1",
    });
    expect(r.success).toBe(false);
  });

  it("still accepts a ref that merely contains the word", () => {
    expect(
      jobCompletedPayloadSchema.safeParse({ ...VALID, jobId: "WO-seed-1" })
        .success,
    ).toBe(true);
  });

  it("identifies seeded refs", () => {
    expect(isSeededJobRef("seed:job-r1")).toBe(true);
    expect(isSeededJobRef("WO-88421")).toBe(false);
    expect(isSeededJobRef(null)).toBe(false);
  });
});

/* -------------------------------------------------------------------------
   Auth
   ------------------------------------------------------------------------- */

function req(authorization?: string): Request {
  return new Request("https://example.test/api/wow-os/job-completed", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("bearer auth", () => {
  it("fails closed when the secret is unset", () => {
    expect(isAuthorisedBearer(req("Bearer anything"), undefined)).toBe(false);
    expect(isAuthorisedBearer(req("Bearer anything"), "")).toBe(false);
  });

  it("rejects a missing, malformed or wrong token", () => {
    expect(isAuthorisedBearer(req(), "s3cret")).toBe(false);
    expect(isAuthorisedBearer(req("s3cret"), "s3cret")).toBe(false);
    expect(isAuthorisedBearer(req("Basic s3cret"), "s3cret")).toBe(false);
    expect(isAuthorisedBearer(req("Bearer wrong"), "s3cret")).toBe(false);
    expect(isAuthorisedBearer(req("bearer s3cret"), "s3cret")).toBe(false);
    expect(isAuthorisedBearer(req("Bearer  s3cret"), "s3cret")).toBe(false);
  });

  it("accepts the exact token", () => {
    expect(isAuthorisedBearer(req("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("is unaffected by surrounding whitespace, which HTTP strips first", () => {
    // Fetch trims header values on construction, so a padded header never
    // reaches the comparison. Asserted rather than assumed: if this ever
    // changes, the token would fail to match and ingest would 401 in a way
    // that looks like a wrong secret.
    expect(req("Bearer s3cret ").headers.get("authorization")).toBe(
      "Bearer s3cret",
    );
    expect(isAuthorisedBearer(req("  Bearer s3cret  "), "s3cret")).toBe(true);
  });

  it("compares unequal lengths without throwing", () => {
    expect(safeEqual("a", "abcdef")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("same", "same")).toBe(true);
  });
});

/* -------------------------------------------------------------------------
   listCompletedJobs — the reconciliation pull
   ------------------------------------------------------------------------- */

function job(id: string, iso: string): CompletedJob {
  return {
    id,
    accountId: "acc-1",
    dealId: null,
    completedAt: new Date(iso),
    workType: "interior",
    scope: "",
    areas: [],
    valueCents: 1000,
    crew: null,
  };
}

describe("listCompletedJobs", () => {
  const rows = [
    job("job-c", "2026-07-30T09:00:00Z"),
    job("job-a", "2026-07-01T09:00:00Z"),
    job("job-b", "2026-07-15T09:00:00Z"),
  ];

  const client = () =>
    new InMemoryWowOsClient(
      new MemoryEstimateStore(),
      new MemoryJobStore(rows),
    );

  it("returns completions at or after `since`, oldest first", async () => {
    const got = await client().listCompletedJobs(new Date("2026-07-10T00:00:00Z"));
    expect(got.map((j) => j.id)).toEqual(["job-b", "job-c"]);
  });

  it("includes the boundary row, so re-running from the newest is safe", async () => {
    const got = await client().listCompletedJobs(new Date("2026-07-15T09:00:00Z"));
    expect(got.map((j) => j.id)).toEqual(["job-b", "job-c"]);
  });

  it("returns everything for an early `since`", async () => {
    const got = await client().listCompletedJobs(new Date("2000-01-01T00:00:00Z"));
    expect(got.map((j) => j.id)).toEqual(["job-a", "job-b", "job-c"]);
  });

  it("returns nothing — not an error — when there is nothing new", async () => {
    const got = await client().listCompletedJobs(new Date("2030-01-01T00:00:00Z"));
    expect(got).toEqual([]);
  });

  it("is empty when no completions exist at all", async () => {
    const empty = new InMemoryWowOsClient(
      new MemoryEstimateStore(),
      new MemoryJobStore(),
    );
    expect(await empty.listCompletedJobs(new Date(0))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  approvalLoad,
  audienceGap,
  audienceSentence,
  cadenceSummary,
  campaignApprovalState,
  completionsAreSeededOnly,
  completionsExist,
  countIsDailyRate,
  countUnit,
  draftIssues,
  newStep,
  reenrolSentence,
  runLengthDays,
  sampleSentence,
  schedule,
  sizeAudience,
  toDraft,
  toSaveInput,
  type AudienceCandidate,
  type CampaignDraft,
  type JobCompletionSource,
  type StepDraft,
} from "@/components/campaigns/draft";
import {
  approvableContent,
  campaignContentHash,
} from "@/lib/campaigns/approval";
import type { Audience, Campaign, CampaignStep } from "@/lib/campaigns/types";

const NOW = new Date(2026, 7, 1); // 1 Aug 2026
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function candidate(
  name: string,
  over: Partial<AudienceCandidate> = {},
): AudienceCandidate {
  return {
    dealId: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    account: `${name}’s place`,
    jobCompletedAt: null,
    tags: [],
    pipelineId: "resi",
    stageId: "past",
    lastEnrolledAt: null,
    ...over,
  };
}

function step(over: Partial<StepDraft> = {}): StepDraft {
  return { ...newStep(0), label: "Step", ...over };
}

function draft(over: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    id: "cmp-1",
    name: "Google review ask",
    category: "REVIEWS",
    description: "",
    audience: { kind: "tagged", params: { tag: "DIRECT HOMEOWNER" } },
    approvalMode: "per_message",
    active: false,
    reenrolAfterDays: null,
    steps: [step({ label: "Ask" })],
    ...over,
  };
}

/* -------------------------------------------------------------------------
   The audience, as a sentence
   ------------------------------------------------------------------------- */

describe("audienceSentence", () => {
  it("says the exact-day audience is exact", () => {
    // "4 days after their job finished" — the spec's own fragment — reads as a
    // threshold to anybody who has used a date filter before. The word that
    // has to survive into the UI is "exactly".
    const s = audienceSentence({
      kind: "job_completed_days_ago",
      params: { days: 4 },
    });
    expect(s).toContain("exactly");
    expect(s).toContain("4 days");
  });

  it("reads day zero as the day of the job rather than “exactly 0 days”", () => {
    expect(
      audienceSentence({ kind: "job_completed_days_ago", params: { days: 0 } }),
    ).toBe("Customers on the day their job finished");
  });

  it("resolves a pipeline and stage to their labels, not their ids", () => {
    // `audienceKindSpec("pipeline_stage").sentence` renders "resi · past",
    // which names nothing a franchise owner has ever seen on screen. The pure
    // module cannot do better without importing pipeline config into a
    // predicate, so the UI resolves it.
    const s = audienceSentence({
      kind: "pipeline_stage",
      params: { pipelineId: "resi", stageId: "second" },
    });
    expect(s).toBe("Everyone sitting in Re-marketing · 2nd Follow-up");
  });

  it("stays grammatical with the parameter missing", () => {
    for (const audience of [
      { kind: "job_completed_days_ago", params: {} },
      { kind: "no_job_in_months", params: {} },
      { kind: "tagged", params: {} },
      { kind: "pipeline_stage", params: {} },
    ] satisfies Audience[]) {
      const s = audienceSentence(audience);
      expect(s).not.toContain("undefined");
      expect(s).not.toContain("NaN");
      expect(s.length).toBeGreaterThan(10);
    }
  });

  it("singularises", () => {
    expect(
      audienceSentence({ kind: "no_job_in_months", params: { months: 1 } }),
    ).toContain("1 month or more");
  });
});

/* -------------------------------------------------------------------------
   The count, and what unit it is in
   ------------------------------------------------------------------------- */

describe("audience size", () => {
  const candidates = [
    candidate("Raman", { tags: ["DIRECT HOMEOWNER"] }),
    candidate("Lorna", { tags: ["DIRECT HOMEOWNER"] }),
    candidate("Simone", { tags: ["DIRECT HOMEOWNER"] }),
    candidate("Ivy City", { tags: ["PROPERTY MANAGER"] }),
  ];
  const tagged: Audience = {
    kind: "tagged",
    params: { tag: "DIRECT HOMEOWNER" },
  };

  it("counts who matches and who a run would actually enrol", () => {
    const size = sizeAudience(tagged, candidates, null, NOW);
    expect(size).toMatchObject({
      matching: 3,
      blocked: 0,
      enrolling: 3,
      total: 4,
    });
  });

  it("separates matching from enrolling when the window blocks people", () => {
    // The distinction the editor exists to show: an audience can be full and
    // still enrol nobody, which looks identical to an empty audience unless
    // the two numbers are kept apart.
    const withHistory = [
      candidate("Raman", {
        tags: ["DIRECT HOMEOWNER"],
        lastEnrolledAt: daysAgo(10),
      }),
      candidate("Lorna", { tags: ["DIRECT HOMEOWNER"] }),
    ];
    const size = sizeAudience(tagged, withHistory, 90, NOW);
    expect(size.matching).toBe(2);
    expect(size.blocked).toBe(1);
    expect(size.enrolling).toBe(1);
    expect(size.sample).toEqual(["Lorna"]);
  });

  it("names up to three of them so the number can be checked", () => {
    const size = sizeAudience(tagged, candidates, null, NOW);
    expect(sampleSentence(size)).toBe("Raman, Lorna and Simone");
  });

  it("counts the rest rather than listing everyone", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      candidate(`Person ${i}`, { tags: ["DIRECT HOMEOWNER"] }),
    );
    expect(sampleSentence(sizeAudience(tagged, many, null, NOW))).toBe(
      "Person 0, Person 1 and Person 2 and 6 others",
    );
  });

  it("has nothing to say about an empty audience", () => {
    expect(sampleSentence(sizeAudience(tagged, [], null, NOW))).toBeNull();
  });

  it("counts the exact-day audience as a rate, not a population", () => {
    // Two people finished four days ago and two finished five. Only the first
    // pair is in the audience today, and tomorrow it will be a different pair
    // entirely — which is why the unit differs from every other kind.
    const post = [
      candidate("A", { jobCompletedAt: daysAgo(4) }),
      candidate("B", { jobCompletedAt: daysAgo(4) }),
      candidate("C", { jobCompletedAt: daysAgo(5) }),
      candidate("D", { jobCompletedAt: daysAgo(3) }),
    ];
    const audience: Audience = {
      kind: "job_completed_days_ago",
      params: { days: 4 },
    };
    expect(sizeAudience(audience, post, null, NOW).enrolling).toBe(2);
    expect(countIsDailyRate("job_completed_days_ago")).toBe(true);
    expect(countUnit("job_completed_days_ago")).toBe("today");
  });

  it("counts every other kind as a standing population", () => {
    for (const kind of ["no_job_in_months", "tagged", "pipeline_stage"] as const) {
      expect(countIsDailyRate(kind)).toBe(false);
      expect(countUnit(kind)).toBe("right now");
    }
  });
});

/* -------------------------------------------------------------------------
   Why an audience selects nobody
   ------------------------------------------------------------------------- */

/** No completions at all — a franchise before the Funnel sends anything. */
const NO_JOBS: JobCompletionSource = { total: 0, fromFunnel: 0 };
/** Completions exist, all written by the seed. Today's demo database. */
const SEEDED_JOBS: JobCompletionSource = { total: 5, fromFunnel: 0 };
/** The Funnel is live. Nothing produces this state yet. */
const FUNNEL_JOBS: JobCompletionSource = { total: 40, fromFunnel: 40 };

describe("audienceGap", () => {
  const empty = sizeAudience({ kind: "tagged", params: {} }, [], null, NOW);
  const postJob: Audience = {
    kind: "job_completed_days_ago",
    params: { days: 4 },
  };
  const oneMatch = sizeAudience(
    postJob,
    [candidate("A", { jobCompletedAt: daysAgo(4) })],
    null,
    NOW,
  );

  it("blames the missing Funnel data, not the author", () => {
    const gap = audienceGap(postJob, empty, NO_JOBS);
    expect(gap?.systemic).toBe(true);
    expect(gap?.body).toContain("Funnel");
  });

  it("still says where a non-zero count came from when it is all seeded", () => {
    // The trap the seed opens. The arithmetic is real, the rows are real, and
    // every one of them was written by us — so "1 enrols today" would read as
    // a working integration to anybody looking at the demo. It is a worked
    // example of the rule, and the panel has to say the difference out loud.
    const gap = audienceGap(postJob, oneMatch, SEEDED_JOBS);
    expect(gap?.systemic).toBe(true);
    expect(gap?.heading).toBe("COUNTED FROM SEEDED JOBS, NOT FROM WOW OS");
    expect(gap?.body).toContain("5 completed jobs");
  });

  it("says it even when the seeded audience is empty", () => {
    // Provenance matters whether the answer is three or zero: an owner who
    // sees a plain "nobody matches" concludes their audience is wrong, when
    // the truth is that no real job data has ever reached us.
    expect(audienceGap(postJob, empty, SEEDED_JOBS)?.heading).toContain(
      "SEEDED JOBS",
    );
  });

  it("goes quiet once the completions are genuinely from the Funnel", () => {
    expect(audienceGap(postJob, oneMatch, FUNNEL_JOBS)).toBeNull();
  });

  it("never claims seeded provenance for an audience that ignores jobs", () => {
    // `tagged` and `pipeline_stage` read no job data, so where the jobs came
    // from says nothing about their counts.
    const tagged: Audience = { kind: "tagged", params: { tag: "X" } };
    const size = sizeAudience(tagged, [candidate("A", { tags: ["X"] })], null, NOW);
    expect(audienceGap(tagged, size, SEEDED_JOBS)).toBeNull();
  });

  it("says nothing while the parameter is still blank", () => {
    // A half-typed audience is not a problem to explain; the sentence already
    // reads with a hole in it and the save is blocked.
    expect(
      audienceGap({ kind: "tagged", params: {} }, empty, FUNNEL_JOBS),
    ).toBeNull();
    expect(
      audienceGap(
        { kind: "pipeline_stage", params: { pipelineId: "resi" } },
        empty,
        FUNNEL_JOBS,
      ),
    ).toBeNull();
  });

  it("distinguishes “nobody matches” from “everyone is in the window”", () => {
    const tagged: Audience = { kind: "tagged", params: { tag: "X" } };

    const nobody = audienceGap(
      tagged,
      sizeAudience(tagged, [], null, NOW),
      FUNNEL_JOBS,
    );
    expect(nobody?.heading).toBe("NOBODY MATCHES THIS");
    expect(nobody?.systemic).toBe(false);

    const blockedSize = sizeAudience(
      tagged,
      [candidate("A", { tags: ["X"], lastEnrolledAt: daysAgo(1) })],
      90,
      NOW,
    );
    const blocked = audienceGap(tagged, blockedSize, FUNNEL_JOBS);
    expect(blocked?.heading).toContain("RE-ENROLMENT WINDOW");
  });
});

describe("job completion provenance", () => {
  it("treats any row at all as enough to evaluate a job audience", () => {
    expect(completionsExist(NO_JOBS)).toBe(false);
    expect(completionsExist(SEEDED_JOBS)).toBe(true);
  });

  it("separates “we have data” from “the integration works”", () => {
    expect(completionsAreSeededOnly(SEEDED_JOBS)).toBe(true);
    expect(completionsAreSeededOnly(FUNNEL_JOBS)).toBe(false);
    // Nothing to be seeded-only about when there is nothing at all — that case
    // belongs to the "Funnel sends no completions" panel instead.
    expect(completionsAreSeededOnly(NO_JOBS)).toBe(false);
  });

  it("counts a partly-real set as real", () => {
    // One genuine Funnel completion means the pipe is open, and the screen
    // should stop apologising for the data even while most of it is seeded.
    expect(completionsAreSeededOnly({ total: 40, fromFunnel: 1 })).toBe(false);
  });
});

/* -------------------------------------------------------------------------
   Steps
   ------------------------------------------------------------------------- */

describe("schedule", () => {
  it("turns relative delays into the absolute days an author thinks in", () => {
    const steps = [
      step({ delayDays: 0 }),
      step({ delayDays: 3 }),
      step({ delayDays: 7 }),
    ];
    expect(schedule(steps).map((r) => r.day)).toEqual([0, 3, 10]);
    expect(runLengthDays(steps)).toBe(10);
  });

  it("summarises the cadence with channels named in plain words", () => {
    expect(
      cadenceSummary([
        step({ delayDays: 0, channel: "SMS" }),
        step({ delayDays: 3, channel: "EMAIL" }),
        step({ delayDays: 4, channel: "PHONE" }),
      ]),
    ).toBe("Day 0 SMS · Day 3 Email · Day 7 Call");
  });

  it("has something to say about no steps at all", () => {
    expect(cadenceSummary([])).toBe("No steps yet");
  });
});

describe("toSaveInput", () => {
  it("numbers steps from their order, not from whatever they carried", () => {
    const input = toSaveInput(
      draft({
        steps: [
          step({ label: "Second", delayDays: 3 }),
          step({ label: "First", delayDays: 0 }),
        ],
      }),
    );
    expect(input.steps.map((s) => [s.stepNumber, s.label])).toEqual([
      [1, "Second"],
      [2, "First"],
    ]);
  });

  it("omits the id on a new campaign so the repository creates rather than updates", () => {
    expect(toSaveInput(draft({ id: null }))).not.toHaveProperty("id");
    expect(toSaveInput(draft({ id: "cmp-1" })).id).toBe("cmp-1");
  });

  it("trims, because a trailing space in a name is not a name", () => {
    const input = toSaveInput(
      draft({ name: "  Newsletter  ", steps: [step({ label: " Issue " })] }),
    );
    expect(input.name).toBe("Newsletter");
    expect(input.steps[0].label).toBe("Issue");
  });
});

/* -------------------------------------------------------------------------
   Approval load
   ------------------------------------------------------------------------- */

describe("approvalLoad", () => {
  it("multiplies steps by people, which is the argument against per-message", () => {
    const steps = [step(), step()];
    expect(approvalLoad(steps, 400, "per_message")).toBe(800);
    expect(approvalLoad(steps, 400, "bulk")).toBe(1);
  });

  it("is zero when nobody is in the audience", () => {
    expect(approvalLoad([step()], 0, "per_message")).toBe(0);
  });
});

/* -------------------------------------------------------------------------
   Validation
   ------------------------------------------------------------------------- */

describe("draftIssues", () => {
  it("passes a complete campaign", () => {
    expect(draftIssues(draft())).toEqual([]);
  });

  it("does not block a campaign whose audience cannot be evaluated yet", () => {
    // The whole stance of the screen: an unsupported audience is explained,
    // never refused. A review campaign written now should still be there when
    // the Funnel starts sending completions.
    expect(
      draftIssues(
        draft({
          audience: { kind: "job_completed_days_ago", params: { days: 4 } },
        }),
      ),
    ).toEqual([]);
  });

  it("accepts day zero and rejects a negative day", () => {
    expect(
      draftIssues(
        draft({ audience: { kind: "job_completed_days_ago", params: { days: 0 } } }),
      ),
    ).toEqual([]);
    expect(
      draftIssues(
        draft({ audience: { kind: "job_completed_days_ago", params: { days: -1 } } }),
      ).join(" "),
    ).toContain("before the job finishes");
  });

  it("catches the blanks", () => {
    const issues = draftIssues(
      draft({
        name: "  ",
        category: "",
        audience: { kind: "tagged", params: {} },
        steps: [],
      }),
    );
    expect(issues).toHaveLength(4);
  });

  it("wants a name on every step, because the queue shows it", () => {
    expect(
      draftIssues(draft({ steps: [step({ label: "" })] })).join(" "),
    ).toContain("Step 1 needs a name");
  });

  it("refuses a sub-day re-enrolment window", () => {
    expect(draftIssues(draft({ reenrolAfterDays: 0 })).join(" ")).toContain(
      "not a window",
    );
  });
});

/* -------------------------------------------------------------------------
   Re-enrolment copy
   ------------------------------------------------------------------------- */

describe("reenrolSentence", () => {
  it("calls the window a safety net for an exact-day audience", () => {
    // Because the audience already cannot re-select the same person, the
    // window is not what stops the nagging — and saying otherwise would teach
    // an author the wrong model of their own campaign.
    expect(reenrolSentence(365, "job_completed_days_ago")).toContain(
      "safety net",
    );
  });

  it("calls it the only guard for a standing audience", () => {
    expect(reenrolSentence(30, "tagged")).toContain("only thing stopping");
  });

  it("says once-only plainly", () => {
    expect(reenrolSentence(null, "tagged")).toContain("Once only");
  });
});

/* -------------------------------------------------------------------------
   The bulk approval gate
   ------------------------------------------------------------------------- */

function campaignStep(over: Partial<CampaignStep> = {}): CampaignStep {
  return {
    id: "cmp-1-s1",
    campaignId: "cmp-1",
    stepNumber: 1,
    delayDays: 0,
    channel: "EMAIL",
    templateId: "tpl-1",
    label: "This month’s issue",
    ...over,
  };
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp-1",
    name: "Homeowner newsletter",
    category: "NEWSLETTERS",
    description: "",
    audience: { kind: "tagged", params: { tag: "DIRECT HOMEOWNER" } },
    approvalMode: "bulk",
    active: true,
    reenrolAfterDays: 30,
    authoredBy: "u-marshall",
    lastRunCount: null,
    approvedAt: null,
    approvedBy: null,
    approvedHash: null,
    steps: [campaignStep()],
    ...over,
  };
}

describe("campaignApprovalState", () => {
  const bodies = new Map([[1, "Hello {{contact.firstName}}"]]);

  it("has nothing to report on a per-message campaign", () => {
    expect(
      campaignApprovalState(campaign({ approvalMode: "per_message" }), bodies),
    ).toEqual({ kind: "per_message" });
  });

  it("refuses to be approvable when a step's copy is chosen at send time", () => {
    // The contradiction worth surfacing: bulk approval fixes wording, and an
    // unpinned step has no wording until the moment it sends. Hashing that as
    // an empty string would tick the box over nothing.
    const state = campaignApprovalState(
      campaign({ steps: [campaignStep({ templateId: null })] }),
      new Map(),
    );
    expect(state).toEqual({ kind: "unapprovable", unpinnedSteps: [1] });
  });

  it("reports an unapproved bulk campaign as never approved", () => {
    expect(campaignApprovalState(campaign(), bodies).kind).toBe("never");
  });

  it("recognises an approval that still matches its content", () => {
    const c = campaign();
    const hash = campaignContentHash(approvableContent(c, bodies));
    const state = campaignApprovalState(
      { ...c, approvedAt: NOW, approvedBy: "u-marshall", approvedHash: hash },
      bodies,
    );
    expect(state.kind).toBe("approved");
  });

  it("goes stale when the copy behind a pinned step changes", () => {
    // The case the hash exists for. Nothing about the campaign row moved — the
    // template it points at was rewritten on the Templates screen — and the
    // approval has to fall over anyway.
    const c = campaign();
    const hash = campaignContentHash(approvableContent(c, bodies));
    const state = campaignApprovalState(
      { ...c, approvedAt: NOW, approvedBy: "u-marshall", approvedHash: hash },
      new Map([[1, "Completely different wording"]]),
    );
    expect(state.kind).toBe("stale");
  });

  it("goes stale when the audience is widened", () => {
    const c = campaign();
    const hash = campaignContentHash(approvableContent(c, bodies));
    const widened = {
      ...c,
      audience: { kind: "tagged" as const, params: { tag: "EXTERIOR" } },
      approvedAt: NOW,
      approvedBy: "u-marshall",
      approvedHash: hash,
    };
    expect(campaignApprovalState(widened, bodies).kind).toBe("stale");
  });
});

/* -------------------------------------------------------------------------
   Round trip
   ------------------------------------------------------------------------- */

describe("toDraft", () => {
  it("orders steps by their number rather than by row order", () => {
    const c = campaign({
      steps: [
        campaignStep({ id: "s2", stepNumber: 2, delayDays: 3, label: "Nudge" }),
        campaignStep({ id: "s1", stepNumber: 1, delayDays: 0, label: "Ask" }),
      ],
    });
    expect(toDraft(c).steps.map((s) => s.label)).toEqual(["Ask", "Nudge"]);
  });

  it("gives every step a distinct key, including two that were never saved", () => {
    const keys = [newStep(0).key, newStep(3).key];
    expect(new Set(keys).size).toBe(2);
  });

  it("survives a round trip through the save shape", () => {
    const c = campaign();
    const input = toSaveInput(toDraft(c));
    expect(input).toMatchObject({
      id: c.id,
      name: c.name,
      category: c.category,
      approvalMode: "bulk",
      reenrolAfterDays: 30,
    });
    expect(input.audience).toEqual(c.audience);
    expect(input.steps[0]).toMatchObject({
      stepNumber: 1,
      delayDays: 0,
      channel: "EMAIL",
      templateId: "tpl-1",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  APPROVAL_TOASTS,
  toastFor,
  type ApprovalDecision,
} from "@/lib/agents/approval-toasts";
import type { Approval, ApprovalStatus, TriggerType } from "@/lib/types";

/**
 * The state machine is the product's central promise made mechanical:
 * nothing sends until a human approves it, and a decision once made is not
 * quietly undone.
 *
 * These tests import the pure half of `approval-machine.ts` — the transition
 * table, the guards and the toast copy. The effectful `decide()` reaches the
 * database and belongs to the e2e suite; everything that decides *whether* a
 * write is allowed to happen is here.
 */

// `approval-machine.ts` pulls in the Neon client at module load, which a unit
// test has no business doing. Only the pure exports are needed, so they come
// in through a dynamic import that runs after the db module is stubbed.
const machine = await importMachine();

async function importMachine() {
  const { default: mock } = await import("vitest").then((v) => ({ default: v.vi }));
  mock.doMock("@/db", () => ({ db: {}, schema: {} }));
  mock.doMock("@/lib/repositories/touchpoints", () => ({ logTouchpoint: async () => {} }));
  mock.doMock("@/lib/repositories/deals", () => ({
    setAiPending: async () => {},
    setNextAction: async () => {},
  }));
  mock.doMock("@/lib/repositories/audit", () => ({ appendAudit: async () => {} }));
  return import("@/lib/agents/approval-machine");
}

const {
  DECISION_PATHS,
  IllegalApprovalTransitionError,
  LEGAL_TRANSITIONS,
  SUPPRESSION_ACTION,
  SUPPRESSION_DAYS,
  assertDecision,
  assertTransition,
  canTransition,
  finalStatus,
  nextActionFor,
  suppressionUntil,
  touchpointChannel,
} = machine;

const ALL_STATUSES: ApprovalStatus[] = [
  "drafted",
  "approved",
  "edited",
  "sent",
  "skipped",
];

/* -------------------------------------------------------------------------
   Legal paths
   ------------------------------------------------------------------------- */

describe("legal approval paths", () => {
  it("walks drafted → approved → sent", () => {
    expect(assertDecision("drafted", "approve")).toEqual(["approved", "sent"]);
    expect(finalStatus("approve")).toBe("sent");
  });

  it("walks drafted → edited → sent", () => {
    expect(assertDecision("drafted", "edit")).toEqual(["edited", "sent"]);
    expect(finalStatus("edit")).toBe("sent");
  });

  it("walks drafted → skipped", () => {
    expect(assertDecision("drafted", "skip")).toEqual(["skipped"]);
    expect(finalStatus("skip")).toBe("skipped");
  });

  it("accepts each hop of every declared path individually", () => {
    for (const path of Object.values(DECISION_PATHS)) {
      let current: ApprovalStatus = "drafted";
      for (const next of path) {
        expect(() => assertTransition(current, next)).not.toThrow();
        current = next;
      }
    }
  });
});

/* -------------------------------------------------------------------------
   Illegal transitions
   ------------------------------------------------------------------------- */

describe("illegal approval transitions", () => {
  it("throws on every transition the table does not declare", () => {
    let checked = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (LEGAL_TRANSITIONS[from].includes(to)) continue;
        checked += 1;
        expect(() => assertTransition(from, to)).toThrow(
          IllegalApprovalTransitionError,
        );
        expect(canTransition(from, to)).toBe(false);
      }
    }
    // 25 pairs, 5 of them legal.
    expect(checked).toBe(20);
  });

  it("refuses to send an approval twice", () => {
    for (const decision of ["approve", "edit"] as ApprovalDecision[]) {
      expect(() => assertDecision("sent", decision)).toThrow(
        IllegalApprovalTransitionError,
      );
    }
  });

  it("refuses to revive a skipped approval", () => {
    for (const decision of ["approve", "edit", "skip"] as ApprovalDecision[]) {
      expect(() => assertDecision("skipped", decision)).toThrow(
        IllegalApprovalTransitionError,
      );
    }
  });

  it("refuses to skip something that has already gone out", () => {
    expect(() => assertDecision("sent", "skip")).toThrow(
      IllegalApprovalTransitionError,
    );
  });

  it("refuses to re-decide an approval mid-flight", () => {
    // `approved` and `edited` are transient — only `sent` follows them.
    for (const from of ["approved", "edited"] as ApprovalStatus[]) {
      for (const decision of ["approve", "edit", "skip"] as ApprovalDecision[]) {
        expect(() => assertDecision(from, decision)).toThrow(
          IllegalApprovalTransitionError,
        );
      }
    }
  });

  it("names both ends of the transition it rejected", () => {
    try {
      assertTransition("sent", "approved");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalApprovalTransitionError);
      const typed = error as InstanceType<typeof IllegalApprovalTransitionError>;
      expect(typed.from).toBe("sent");
      expect(typed.to).toBe("approved");
      expect(typed.message).toContain("sent → approved");
    }
  });

  it("has no way out of a terminal status", () => {
    expect(LEGAL_TRANSITIONS.sent).toEqual([]);
    expect(LEGAL_TRANSITIONS.skipped).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------- */

describe("toast copy", () => {
  it("matches the prototype word for word", () => {
    expect(toastFor("approve", "Delia Marchetti")).toBe(
      "Sent and logged with agent provenance — next step set on Delia Marchetti",
    );
    expect(toastFor("edit", "Delia Marchetti")).toBe(
      "Opens the draft inline — your edits train the next one",
    );
    expect(toastFor("skip", "Delia Marchetti")).toBe(
      "Skipped — logged as a decision, trigger will not re-fire for 90 days",
    );
  });

  it("names the person the next step was set on", () => {
    expect(APPROVAL_TOASTS.approve("Yuki Tanabe")).toContain("on Yuki Tanabe");
  });

  it("promises the same suppression window the machine enforces", () => {
    expect(APPROVAL_TOASTS.skip()).toContain(`${SUPPRESSION_DAYS} days`);
  });
});

/* -------------------------------------------------------------------------
   Suppression
   ------------------------------------------------------------------------- */

describe("skip suppression", () => {
  it("holds the trigger for 90 days from the decision", () => {
    const now = new Date(2026, 6, 31);
    const until = suppressionUntil(now);
    expect(SUPPRESSION_DAYS).toBe(90);
    expect(until.getTime() - now.getTime()).toBe(90 * 86_400_000);
    expect(until.getFullYear()).toBe(2026);
    expect(until.getMonth()).toBe(9); // 29 October 2026
    expect(until.getDate()).toBe(29);
  });

  it("writes under an action the runners can find again", () => {
    expect(SUPPRESSION_ACTION).toBe("trigger.suppressed");
  });
});

/* -------------------------------------------------------------------------
   Side effects the machine plans
   ------------------------------------------------------------------------- */

describe("next action", () => {
  const now = new Date(2026, 6, 31);

  function approvalWith(triggerType: TriggerType): Approval {
    return {
      id: "a1",
      dealId: "r1",
      triggerType,
      title: "",
      subtitle: "",
      chip: "",
      channel: "SMS",
      recipient: "",
      body: "",
      reasons: [],
      footnote: "",
      status: "drafted",
      createdAt: now,
    };
  }

  it("always sets a next action, so an approved send is never left unattended", () => {
    const types: TriggerType[] = [
      "eleven_month",
      "seasonal",
      "revival",
      "sequence",
    ];
    for (const type of types) {
      const next = nextActionFor(approvalWith(type), now);
      expect(next.label.length).toBeGreaterThan(0);
      expect(next.dueAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("chases a revival soonest, because the call is the whole point", () => {
    const revival = nextActionFor(approvalWith("revival"), now);
    const warranty = nextActionFor(approvalWith("eleven_month"), now);
    expect(revival.dueAt.getTime()).toBeLessThan(warranty.dueAt.getTime());
  });
});

describe("touchpoint channel", () => {
  it("strips the display suffix off the stored channel label", () => {
    expect(touchpointChannel("SMS · she prefers text")).toBe("SMS");
    expect(touchpointChannel("SMS · they prefer text")).toBe("SMS");
    expect(touchpointChannel("EMAIL")).toBe("EMAIL");
  });

  it("falls back to a note rather than inventing a channel", () => {
    expect(touchpointChannel("carrier pigeon")).toBe("NOTE");
    expect(touchpointChannel("")).toBe("NOTE");
  });
});

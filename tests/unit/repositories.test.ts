import { describe, expect, it } from "vitest";
import { DEAL_FIXTURES } from "@/lib/fixtures/deals";
import {
  anchorDays,
  lastTouchFrom,
  nextDueFrom,
  staleDays,
} from "@/lib/fixtures/time";
import { PIPELINE_IDS, PIPES } from "@/lib/pipelines";
import type { PipelineId } from "@/lib/types";
import {
  AGENT_NAMES,
  daysSince,
  formatDue,
  formatThousands,
  metricDollars,
  metricNumber,
  metricThousands,
  isContactChannel,
  isCustomerContactChannel,
  isNeglected,
  resolveProvenance,
} from "@/lib/repositories/rules";

const MS_DAY = 86_400_000;
/** A fixed Friday so weekday-relative due strings are deterministic. */
const NOW = new Date(2026, 6, 31, 12, 0, 0);
const ago = (days: number) => new Date(NOW.getTime() - days * MS_DAY);

describe("neglect threshold", () => {
  it("uses 14 days for Residential, Biz Dev and Partner", () => {
    for (const pipe of ["resi", "bizdev", "partner"] as const) {
      expect(PIPES[pipe].neglectDays).toBe(14);
    }
  });

  it("uses 45 days for Commercial — the cycle runs months, not weeks", () => {
    expect(PIPES.comm.neglectDays).toBe(45);
  });

  it("is inclusive at the boundary and false one day inside it", () => {
    expect(isNeglected(ago(13), 14, NOW)).toBe(false);
    expect(isNeglected(ago(14), 14, NOW)).toBe(true);
    expect(isNeglected(ago(15), 14, NOW)).toBe(true);

    expect(isNeglected(ago(44), 45, NOW)).toBe(false);
    expect(isNeglected(ago(45), 45, NOW)).toBe(true);
  });

  it("measures a never-contacted deal from when the record was created", () => {
    // Sitting in Identified for a month with no call is the most neglected
    // thing on the board, not an exemption.
    expect(isNeglected(null, 14, NOW, null, ago(30))).toBe(true);
    // Added yesterday is simply new.
    expect(isNeglected(null, 14, NOW, null, ago(1))).toBe(false);
  });

  it("cannot judge a deal with neither a touch nor a creation date", () => {
    expect(isNeglected(null, 14, NOW)).toBe(false);
  });

  it("spares any deal with an on-time next action, however long the silence", () => {
    expect(isNeglected(ago(400), 14, NOW, "ok")).toBe(false);
    expect(isNeglected(null, 14, NOW, "ok", ago(400))).toBe(false);
    expect(isNeglected(ago(400), 14, NOW, "overdue")).toBe(true);
    expect(isNeglected(ago(400), 14, NOW, null)).toBe(true);
  });

  it("does not neglect a touch in the future (clock skew)", () => {
    expect(isNeglected(new Date(NOW.getTime() + MS_DAY), 14, NOW)).toBe(false);
  });

  it("holds a 16-day commercial deal below the threshold a 16-day resi deal fails", () => {
    expect(isNeglected(ago(16), PIPES.comm.neglectDays, NOW)).toBe(false);
    expect(isNeglected(ago(16), PIPES.resi.neglectDays, NOW)).toBe(true);
  });

  it("counts whole elapsed days", () => {
    expect(daysSince(ago(21), NOW)).toBe(21);
    expect(daysSince(ago(0.5), NOW)).toBe(0);
  });
});

describe("New Leads: a pipeline measured in minutes", () => {
  const newLeads = DEAL_FIXTURES.filter((d) => d.pipe === "newleads");

  it("seeds the five leads Marshall's board shows, one per live stage", () => {
    expect(newLeads).toHaveLength(5);
    // Nurture is deliberately empty: the screenshot has two leads in New and
    // one each through the ladder. An empty column is a real state here.
    expect(newLeads.map((d) => d.stage).sort()).toEqual([
      "booked",
      "contacted",
      "new",
      "new",
      "qualified",
    ]);
  });

  it("carries no track chip, because the source is a card metric here", () => {
    // Residential uses chips to say *why* we're re-approaching someone. New
    // Leads says *how they arrived*, and does it in the metric strip — so a
    // track chip here would be a second, competing answer to the same question.
    for (const d of newLeads) expect(d.track ?? null).toBeNull();
  });

  it("reads sub-day staleness, because a day is the whole SLA here", () => {
    expect(staleDays("new 12 min ago")).toBeCloseTo(12 / 1440, 6);
    expect(staleDays("28 hr silent")).toBeCloseTo(28 / 24, 6);
    expect(staleDays("touched 6 hr ago")).toBeCloseTo(0.25, 6);
  });

  it("breaches the 1-day SLA on the overnight lead and only that one", () => {
    const breached = newLeads.filter((d) =>
      isNeglected(
        lastTouchFrom(d.stale, NOW),
        PIPES.newleads.neglectDays,
        NOW,
        d.next?.state ?? null,
      ),
    );
    // n1 is 12 minutes old, n2 sat unworked overnight past the SLA.
    expect(breached.map((d) => d.id)).toEqual(["n2"]);
  });

  it("keeps the minutes-old lead off the list even at a 1-day threshold", () => {
    const n1 = newLeads.find((d) => d.id === "n1")!;
    expect(daysSince(lastTouchFrom(n1.stale, NOW)!, NOW)).toBe(0);
    expect(isNeglected(lastTouchFrom(n1.stale, NOW), 1, NOW, "ok")).toBe(false);
  });

  it("reads hour-grained due strings in both directions", () => {
    const overdue = nextDueFrom("Was due 4 hours ago", NOW)!;
    expect(overdue.getTime()).toBe(NOW.getTime() - 4 * 3_600_000);
    const soon = nextDueFrom("Due in 8 min", NOW)!;
    expect(soon.getTime()).toBe(NOW.getTime() + 8 * 60_000);
  });

  it("attributes the neighbour leads to the job that produced them", () => {
    const sourced = DEAL_FIXTURES.filter((d) => d.sourcedFromDealId === "r8");
    expect(sourced.map((d) => d.id).sort()).toEqual(["n2", "n5"]);

    // At least one has to carry a price, or the attribution panel can only
    // report a count — and "1 lead, no value" is the opposite of the argument
    // that panel exists to make.
    const priced = sourced.filter((d) =>
      d.metrics?.some((m) => m.label === "EST. VALUE"),
    );
    expect(priced.length).toBeGreaterThan(0);

    // The literal next-door lead states the relationship in its metric strip.
    // The value is left blank in the fixture on purpose — the seed fills it
    // from the linked job — so this asserts the slot, not the seed's text.
    const nextDoor = sourced.find((d) => d.id === "n2")!;
    expect(nextDoor.metrics?.some((m) => m.label === "NEIGHBOUR OF")).toBe(
      true,
    );
  });
});

describe("neighbour campaign inputs", () => {
  it("keeps the warned lead past target but short of escalation", () => {
    // n1 is 14 minutes old against a 5-minute target — deliberately late but
    // not yet escalated, which is the state the board is drawn in. Moving it
    // inside 5 minutes would delete the only example of that state.
    const n1 = DEAL_FIXTURES.find((d) => d.id === "n1")!;
    const minutes = (staleDays(n1.stale) ?? 0) * 1440;
    expect(minutes).toBeGreaterThan(5);
    expect(minutes).toBeLessThan(60);
    expect(n1.next?.state).toBe("ok");
  });

  it("leaves the breaching lead with no contact to point at", () => {
    // The predicate must see silence, not a friendly call. n2 is seeded with a
    // SOURCE row only — asserted here so nobody gives it a timeline later.
    const n2 = DEAL_FIXTURES.find((d) => d.id === "n2")!;
    expect((staleDays(n2.stale) ?? 0) * 24).toBeGreaterThan(24);
    expect(n2.next?.state).toBe("overdue");
  });

  it("keeps r8's card describing the booked estimate, not the finished job", () => {
    // The completion lives on a JOB touchpoint; the card describes the *next*
    // job Lorna booked off the back of it. Both are true of a repeat customer,
    // and neither should be rewritten to accommodate the other.
    const r8 = DEAL_FIXTURES.find((d) => d.id === "r8")!;
    expect(r8.track).toBe("repeat");
    expect(r8.stale).toBe("booked yesterday");
    expect(r8.next?.due).toBe("Thu 10:00 AM · Kris Jolin");
    expect(r8.osRef).toBe("EST-40218");
  });

  it("points every sourced lead at a job that actually exists", () => {
    // The source *field* can say anything — a neighbour lead often carries the
    // sign or ad that caught them. The link is what the attribution query
    // reads, so it is the link that has to resolve.
    const ids = new Set(DEAL_FIXTURES.map((d) => d.id));
    const sourced = DEAL_FIXTURES.filter((d) => d.sourcedFromDealId);
    expect(sourced.length).toBeGreaterThan(0);
    for (const d of sourced) expect(ids.has(d.sourcedFromDealId!)).toBe(true);
  });
});

describe("money metrics carry their own unit", () => {
  it("reads a commercial bid written in K", () => {
    expect(metricThousands("$180K")).toBe(180);
    expect(metricDollars("$180K")).toBe(180_000);
  });

  it("reads a residential job written in full dollars", () => {
    // Treating "$5,200" as 5200 thousands is how $14K became $14.00M.
    expect(metricThousands("$5,200")).toBeCloseTo(5.2, 6);
    expect(metricDollars("$5,200")).toBe(5_200);
  });

  it("reads millions", () => {
    expect(metricThousands("$1.05M")).toBeCloseTo(1050, 6);
  });

  it("keeps counts as counts", () => {
    expect(metricNumber("14")).toBe(14);
    expect(metricNumber("High")).toBe(0);
  });

  it("formats the way the dashboards write money", () => {
    expect(formatThousands(14)).toBe("$14K");
    expect(formatThousands(192.4)).toBe("$192K");
    expect(formatThousands(1050)).toBe("$1.05M");
  });

  it("writes nothing as $0, never $0K", () => {
    expect(formatThousands(0)).toBe("$0");
  });
});

describe("contact channels", () => {
  it("counts a note as engagement — it resets the silence clock", () => {
    expect(isContactChannel("NOTE")).toBe(true);
  });

  it("does not count a note as reaching the customer", () => {
    // A rep jotting "left a voicemail, will retry" has not had a conversation,
    // and letting that block an agent send would silence the queue.
    expect(isCustomerContactChannel("NOTE")).toBe(false);
  });

  it("never counts system events as either", () => {
    for (const channel of ["TRIGGER", "JOB", "SOURCE"]) {
      expect(isContactChannel(channel)).toBe(false);
      expect(isCustomerContactChannel(channel)).toBe(false);
    }
  });

  it("agrees on the four real outreach channels", () => {
    for (const channel of ["SMS", "EMAIL", "CALL", "VISIT"]) {
      expect(isContactChannel(channel)).toBe(true);
      expect(isCustomerContactChannel(channel)).toBe(true);
    }
  });
});

describe("touchpoint provenance", () => {
  // r1 is owned by the Re-marketing agent, so the deal owner is an agent even
  // when a person is the one doing the work. That is what made this wrong.
  const agentOwned = {
    name: "Re-marketing agent",
    initials: "AI",
    isAgent: true,
  };
  const marshall = { name: "Marshall Behrns", initials: "MB" };

  it("names the person, not the deal's owner, when a rep logs on an AI-owned card", () => {
    expect(
      resolveProvenance({ actor: marshall, dealOwner: agentOwned }),
    ).toEqual({ who: "Marshall Behrns", byAgent: false, initials: "MB" });
  });

  it("names the agent when an agent acts alone", () => {
    expect(
      resolveProvenance({
        agentName: AGENT_NAMES["agent-remarketing"],
        dealOwner: agentOwned,
      }),
    ).toEqual({ who: "Re-marketing agent", byAgent: true, initials: "AI" });
  });

  it("names both when an agent drafted and a person approved", () => {
    expect(
      resolveProvenance({
        actor: marshall,
        agentName: AGENT_NAMES["agent-prospecting"],
        dealOwner: agentOwned,
      }),
    ).toEqual({
      who: "Prospecting agent · approved by Marshall Behrns",
      byAgent: true,
      initials: "AI",
    });
  });

  it("lets an explicit who win", () => {
    const p = resolveProvenance({
      who: "WOW Leads automation",
      byAgent: true,
      actor: marshall,
      dealOwner: agentOwned,
    });
    expect(p.who).toBe("WOW Leads automation");
    expect(p.byAgent).toBe(true);
  });

  it("falls back to the deal owner only when there is no actor at all", () => {
    expect(resolveProvenance({ dealOwner: agentOwned }).who).toBe(
      "Re-marketing agent",
    );
  });

  it("never marks a human touch as agent work", () => {
    const p = resolveProvenance({
      actor: marshall,
      dealOwner: { name: "Dani Koval", initials: "DK", isAgent: false },
    });
    expect(p.byAgent).toBe(false);
    expect(p.initials).toBe("MB");
  });
});

describe("stale strings map to real timestamps", () => {
  it("reads the silence forms the handoff calls out", () => {
    expect(staleDays("19d silent")).toBe(19);
    expect(staleDays("touched 2d ago")).toBe(2);
    expect(staleDays("5 mo no referral")).toBe(152);
  });

  it("reads the remaining silence forms in the fixture set", () => {
    expect(staleDays("on hold 3 wks")).toBe(21);
    expect(staleDays("day 7 of 10")).toBe(7);
    expect(staleDays("booked yesterday")).toBe(1);
    expect(staleDays("promo sent 3d ago")).toBe(3);
  });

  it("reads job and loss strings literally — they are real silence", () => {
    // Nobody has spoken to these customers in that long. A2's revival trigger
    // depends on seeing that no one contacted Rudy Kaminski after the loss.
    expect(staleDays("11 mo since job")).toBe(334);
    expect(staleDays("4 mo since job")).toBe(122);
    expect(staleDays("lost 6 mo ago")).toBe(182);
  });

  it("returns null for a lead nobody has contacted", () => {
    expect(staleDays("not yet contacted")).toBeNull();
    expect(lastTouchFrom("not yet contacted", NOW)).toBeNull();
  });

  it("gives every fixture deal a last-touch that agrees with its card copy", () => {
    for (const d of DEAL_FIXTURES) {
      const days = staleDays(d.stale);
      const at = lastTouchFrom(d.stale, NOW);
      if (days === null) {
        expect(at).toBeNull();
      } else {
        // New Leads staleness is sub-day, so compare on the same floor the
        // neglect query uses rather than demanding whole-day equality.
        expect(daysSince(at!, NOW)).toBe(Math.floor(days));
      }
    }
  });

  it("puts the staleWarn deals past their pipeline's threshold", () => {
    const warned = DEAL_FIXTURES.filter((d) => d.staleWarn);
    expect(warned.map((d) => d.id)).toEqual(["r4", "c3", "b4", "p5", "n2"]);
    for (const d of warned) {
      // c3 is 16 days silent — flagged on the card, but Commercial's 45-day
      // cycle means it is not yet *neglected*. The two signals are different.
      const expected = d.id !== "c3";
      expect(
        isNeglected(lastTouchFrom(d.stale, NOW), PIPES[d.pipe].neglectDays, NOW),
      ).toBe(expected);
    }
  });

  it("anchors the timeline to the last-touch date, not a flat 3 days", () => {
    // The prototype hard-codes "3 days ago" on every generic timeline, which
    // would put a friendly "Spoke with the contact" three days back on Grant
    // Whitfield while his card reads "19d silent", and would tell the trigger
    // service that Rudy Kaminski was called this week.
    expect(anchorDays("19d silent")).toBe(19);
    expect(anchorDays("5 mo no referral")).toBe(152);
    expect(anchorDays("lost 6 mo ago")).toBe(182);
    expect(anchorDays("11 mo since job")).toBe(334);
    expect(anchorDays("not yet contacted")).toBeNull();
  });

  it("neglects exactly b4, r4, p5 and n2 across the whole fixture set", () => {
    // Every other deal is either inside its threshold or has someone booked to
    // call it. The prototype hard-codes c3 into this list; Commercial's 45-day
    // cycle takes it out. n2 is the New Leads SLA breach — one day, not
    // fourteen, which is the point of a per-pipeline threshold.
    const neglected = DEAL_FIXTURES.filter((d) =>
      isNeglected(
        lastTouchFrom(d.stale, NOW),
        PIPES[d.pipe].neglectDays,
        NOW,
        d.next?.state ?? null,
      ),
    ).map((d) => d.id);
    expect(neglected.sort()).toEqual(["b4", "n2", "p5", "r4"]);
  });

  it("keeps a never-contacted lead off the list while its intro call stands", () => {
    // p4 Halvorsen has never been contacted, but there is an intro call booked
    // for Friday. Cancel it and the lead is exactly what neglect means.
    const p4 = DEAL_FIXTURES.find((d) => d.id === "p4")!;
    expect(staleDays(p4.stale)).toBeNull();
    expect(p4.next?.state).toBe("ok");
    const createdAt = ago(18);
    expect(isNeglected(null, 14, NOW, "ok", createdAt)).toBe(false);
    expect(isNeglected(null, 14, NOW, null, createdAt)).toBe(true);
  });

  it("spares a long-silent deal that has a next action booked", () => {
    // r6: lost on price 182 days ago, nobody has called since — correctly, the
    // revival cooling period only just ended — and there is a revival call on
    // the calendar for Thursday. Being worked, not being dropped.
    const r6 = DEAL_FIXTURES.find((d) => d.id === "r6")!;
    expect(staleDays(r6.stale)).toBe(182);
    expect(r6.next?.state).toBe("ok");
    expect(isNeglected(lastTouchFrom(r6.stale, NOW), 14, NOW, "ok")).toBe(false);
    // Let that Thursday call slip and it lands on the manager's list.
    expect(isNeglected(lastTouchFrom(r6.stale, NOW), 14, NOW, "overdue")).toBe(true);
    expect(isNeglected(lastTouchFrom(r6.stale, NOW), 14, NOW, null)).toBe(true);
  });
});

describe("due strings map to real timestamps", () => {
  it("puts every overdue card in the past", () => {
    for (const d of DEAL_FIXTURES) {
      if (d.next?.state !== "overdue") continue;
      const at = nextDueFrom(d.next.due, NOW);
      expect(at).not.toBeNull();
      expect(at!.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it("reads 'Was due N days ago' exactly", () => {
    expect(daysSince(nextDueFrom("Was due 5 days ago", NOW)!, NOW)).toBe(5);
    expect(daysSince(nextDueFrom("Was due 11 days ago", NOW)!, NOW)).toBe(11);
  });

  it("reads today, tomorrow and weekday forms", () => {
    const today = nextDueFrom("Today 3:00 PM", NOW)!;
    expect(today.getDate()).toBe(NOW.getDate());
    expect(today.getHours()).toBe(15);

    // NOW is the 31st, so "tomorrow" also crosses a month boundary.
    const tomorrow = nextDueFrom("Tomorrow 10:00 AM", NOW)!;
    expect(tomorrow.toDateString()).toBe(
      new Date(NOW.getTime() + MS_DAY).toDateString(),
    );
    expect(tomorrow.getHours()).toBe(10);

    // NOW is a Friday; "Thu 11:00 AM" is the Thursday ahead, never behind.
    const thu = nextDueFrom("Thu 11:00 AM", NOW)!;
    expect(thu.getDay()).toBe(4);
    expect(thu.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("reads calendar dates with and without a year", () => {
    const sep = nextDueFrom("Sep 4 · 6:30 PM", NOW)!;
    expect([sep.getMonth(), sep.getDate(), sep.getHours(), sep.getMinutes()]).toEqual(
      [8, 4, 18, 30],
    );

    const jan = nextDueFrom("Jan 8 2027 · scheduled", NOW)!;
    expect([jan.getFullYear(), jan.getMonth(), jan.getDate()]).toEqual([2027, 0, 8]);

    const mar = nextDueFrom("Mar 2027 · scheduled", NOW)!;
    expect([mar.getFullYear(), mar.getMonth(), mar.getDate()]).toEqual([2027, 2, 1]);
  });

  it("resolves a due date for every dated fixture card", () => {
    const undated = DEAL_FIXTURES.filter(
      (d) => d.next && nextDueFrom(d.next.due, NOW) === null,
    );
    expect(undated).toEqual([]);
  });
});

describe("formatDue", () => {
  it("writes dates back in the form the board displays", () => {
    expect(formatDue(new Date(2026, 7, 2, 9, 0))).toBe("Aug 2 · 9:00 AM");
    expect(formatDue(new Date(2026, 7, 2, 13, 30))).toBe("Aug 2 · 1:30 PM");
    expect(formatDue(new Date(2026, 7, 2, 0, 5))).toBe("Aug 2 · 12:05 AM");
  });

  it("round-trips through the due parser", () => {
    const at = new Date(2026, 8, 4, 18, 30);
    const parsed = nextDueFrom(formatDue(at), NOW)!;
    expect(parsed.getTime()).toBe(at.getTime());
  });
});

describe("fixture integrity", () => {
  it("holds the 25 prototype leads plus the 5 New Leads fixtures", () => {
    expect(DEAL_FIXTURES).toHaveLength(30);
    expect(new Set(DEAL_FIXTURES.map((d) => d.id)).size).toBe(30);
    expect(DEAL_FIXTURES.filter((d) => d.pipe !== "newleads")).toHaveLength(25);
  });

  it("places every lead on a stage of its own pipeline", () => {
    for (const d of DEAL_FIXTURES) {
      expect(PIPES[d.pipe].stages.map((s) => s.id)).toContain(d.stage);
    }
  });

  // Residential is the only pipeline that uses track chips. New Leads answers
  // "how did they arrive?" in the metric strip instead — a chip there would be
  // a second, competing answer to the same question — so its deals carry no
  // track at all, not an unused one.
  const TRACK_VOCABULARY: Partial<Record<PipelineId, string[]>> = {
    resi: ["referral", "repeat", "revival"],
  };

  it("draws each lead's track from its own pipeline's vocabulary", () => {
    for (const d of DEAL_FIXTURES) {
      const vocabulary = TRACK_VOCABULARY[d.pipe];
      if (vocabulary) {
        expect(d.track).toBeTruthy();
        expect(vocabulary).toContain(d.track);
      } else {
        expect(d.track).toBeUndefined();
      }
    }
  });

  it("keeps every track value inside the one vocabulary that defines it", () => {
    const resi = new Set(TRACK_VOCABULARY.resi);
    for (const d of DEAL_FIXTURES) {
      if (d.pipe !== "resi") expect(resi.has(d.track ?? "")).toBe(false);
    }
  });

  it("covers every pipeline", () => {
    for (const pipe of PIPELINE_IDS) {
      expect(DEAL_FIXTURES.some((d) => d.pipe === pipe)).toBe(true);
    }
  });
});

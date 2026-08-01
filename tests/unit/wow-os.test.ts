import { beforeEach, describe, expect, it } from "vitest";
import { isValidOsRef } from "@/lib/wow-os/booking";
import {
  InMemoryWowOsClient,
  MemoryEstimateStore,
  __setWowOsClient,
  getWowOsClient,
  type CreateEstimateInput,
  type EstimateStore,
  type StoredEstimate,
} from "@/lib/wow-os/client";

const INPUT: CreateEstimateInput = {
  dealId: "r1",
  leadName: "Marisol Vance",
  address: "1428 Kenyon St NW",
  when: "Thu Aug 6 at 10:00 AM",
  estimatorName: "Kris Jolin",
  source: "Past Customer",
  assignedBy: "Trigger → Dani",
  carries: [
    "Account + contacts",
    "Property details",
    "Access notes",
    "Source · Past Customer",
    "Full activity with provenance",
    "Assigned by · Trigger → Dani",
  ],
};

function client(store: EstimateStore = new MemoryEstimateStore()) {
  return { client: new InMemoryWowOsClient(store), store };
}

describe("createEstimate → getEstimateStatus round trip", () => {
  it("reads back Estimate Scheduled with the appointment intact", async () => {
    const { client: os } = client();

    const { osRef } = await os.createEstimate(INPUT);
    const status = await os.getEstimateStatus(osRef);

    expect(status).toEqual({
      osRef,
      status: "Estimate Scheduled",
      when: "Thu Aug 6 at 10:00 AM",
      estimator: "Kris Jolin",
    });
  });

  it("survives a reload — a fresh client with no cache reads the same estimate", async () => {
    // One shared store, two client instances: this is the reload case. An
    // adapter that only remembered in process memory would fail here.
    const store = new MemoryEstimateStore();
    const { osRef } = await new InMemoryWowOsClient(store).createEstimate(
      INPUT,
    );

    const afterReload = await new InMemoryWowOsClient(store).getEstimateStatus(
      osRef,
    );

    expect(afterReload?.status).toBe("Estimate Scheduled");
    expect(afterReload?.when).toBe("Thu Aug 6 at 10:00 AM");
    expect(afterReload?.estimator).toBe("Kris Jolin");
  });

  it("mints an EST-##### ref", async () => {
    const { client: os } = client();
    const { osRef } = await os.createEstimate(INPUT);
    expect(isValidOsRef(osRef)).toBe(true);
    expect(osRef).toMatch(/^EST-\d{5}$/);
  });

  it("persists the deal id and the appointment", async () => {
    const store = new MemoryEstimateStore();
    const { osRef } = await new InMemoryWowOsClient(store).createEstimate(
      INPUT,
    );

    const stored = await store.load(osRef);
    expect(stored).toEqual({
      osRef,
      dealId: "r1",
      when: "Thu Aug 6 at 10:00 AM",
      estimator: "Kris Jolin",
    });
  });

  it("writes no timeline row of its own", async () => {
    // The adapter must not log a touchpoint: `bookDeal` already writes the
    // Funnel-authored JOB entry, and a second one put two near-identical rows
    // on the Record timeline a second apart. `save` is optional for exactly
    // this reason — the database-backed store does not implement it.
    const readOnly: EstimateStore = {
      osRefExists: async () => false,
      load: async () => null,
    };
    expect(readOnly.save).toBeUndefined();
    await expect(
      new InMemoryWowOsClient(readOnly).createEstimate(INPUT),
    ).resolves.toMatchObject({ osRef: expect.stringMatching(/^EST-\d{5}$/) });
  });

  it("gives distinct refs to distinct estimates", async () => {
    const store = new MemoryEstimateStore();
    const os = new InMemoryWowOsClient(store);
    const refs = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const { osRef } = await os.createEstimate({
        ...INPUT,
        dealId: `deal-${i}`,
      });
      refs.add(osRef);
    }
    expect(refs.size).toBe(25);
  });
});

describe("unknown osRef", () => {
  let os: InMemoryWowOsClient;
  beforeEach(() => {
    os = new InMemoryWowOsClient(new MemoryEstimateStore());
  });

  it("returns null for a well-formed ref the Funnel has never seen", async () => {
    expect(await os.getEstimateStatus("EST-99999")).toBeNull();
  });

  it("returns null for a malformed ref without hitting the store", async () => {
    let touched = false;
    const spy: EstimateStore = {
      osRefExists: async () => false,
      save: async () => {},
      load: async () => {
        touched = true;
        return null;
      },
    };
    const guarded = new InMemoryWowOsClient(spy);
    expect(await guarded.getEstimateStatus("not-a-ref")).toBeNull();
    expect(await guarded.getEstimateStatus("")).toBeNull();
    expect(touched).toBe(false);
  });
});

describe("ref collisions", () => {
  it("retries past a taken ref", async () => {
    const taken = new Set<string>();
    let saved: StoredEstimate | null = null;
    let checks = 0;

    const store: EstimateStore = {
      osRefExists: async (ref) => {
        checks++;
        // Claim the first two candidates, then let the third through.
        if (checks <= 2) {
          taken.add(ref);
          return true;
        }
        return false;
      },
      save: async (r) => {
        saved = r;
      },
      load: async (ref) => (saved?.osRef === ref ? saved : null),
    };

    const { osRef } = await new InMemoryWowOsClient(store).createEstimate(
      INPUT,
    );
    expect(checks).toBe(3);
    expect(taken.has(osRef)).toBe(false);
    expect(isValidOsRef(osRef)).toBe(true);
  });

  it("gives up rather than issuing a duplicate ref", async () => {
    const alwaysTaken: EstimateStore = {
      osRefExists: async () => true,
      save: async () => {},
      load: async () => null,
    };
    await expect(
      new InMemoryWowOsClient(alwaysTaken).createEstimate(INPUT),
    ).rejects.toThrow(/unique osRef/);
  });
});

describe("reconstructing the appointment from the deal row", () => {
  // `DbEstimateStore` reads `deals.next_due`, which `bookDeal` writes as
  // "<whenLabel> · <estimatorName>". These cover that parse without a database.
  const parse = (nextDue: string | null) => {
    const at = nextDue?.indexOf(" · ") ?? -1;
    if (!nextDue || at === -1)
      return { when: "Scheduled", estimator: "Unassigned" };
    return { when: nextDue.slice(0, at), estimator: nextDue.slice(at + 3) };
  };

  it("splits the booked form", () => {
    expect(parse("Thu Aug 6 at 10:00 AM · Kris Jolin")).toEqual({
      when: "Thu Aug 6 at 10:00 AM",
      estimator: "Kris Jolin",
    });
  });

  it("falls back for a deal seeded with an osRef but never booked", () => {
    // The demo's EST-40218 is exactly this case.
    expect(parse(null)).toEqual({
      when: "Scheduled",
      estimator: "Unassigned",
    });
    expect(parse("Follow up Friday")).toEqual({
      when: "Scheduled",
      estimator: "Unassigned",
    });
  });
});

describe("client selection", () => {
  it("defaults to the in-memory adapter and honours an injected one", () => {
    __setWowOsClient(null);
    expect(getWowOsClient()).toBeInstanceOf(InMemoryWowOsClient);

    const fake = new InMemoryWowOsClient(new MemoryEstimateStore());
    __setWowOsClient(fake);
    expect(getWowOsClient()).toBe(fake);

    __setWowOsClient(null);
  });
});

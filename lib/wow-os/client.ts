/**
 * ============================================================================
 * WOW OS FUNNEL ADAPTER — THE ONLY FILE A REAL INTEGRATION HAS TO REPLACE
 * ============================================================================
 *
 * WOW Leads is the pre-Funnel half of WOW OS. The moment a lead is booked it
 * stops being a lead and becomes a scheduled estimate in the *existing* WOW OS
 * Funnel. This module is that seam, and nothing outside `lib/wow-os/` may talk
 * to the Funnel directly.
 *
 * ---------------------------------------------------------------------------
 * WHAT A REAL INTEGRATION MUST REPLACE
 * ---------------------------------------------------------------------------
 * Exactly one thing: write an `HttpWowOsClient implements WowOsClient` below
 * and return it from `getWowOsClient()`. Do not change the interface, the
 * server action, or any component — they are already written against the
 * interface and nothing else.
 *
 * The real implementation must:
 *   1. POST the estimate to the Funnel and return the `osRef` the *Funnel*
 *      mints. Delete `generateOsRef` from `lib/wow-os/booking.ts` at that
 *      point — minting ids on this side is a stand-in, and two systems
 *      inventing the same id space is how you get collisions.
 *   2. GET the estimate status live. `InMemoryWowOsClient` always reports
 *      "Estimate Scheduled" because nothing here can advance an estimate to
 *      "In Progress" or "Complete"; only the Funnel knows that.
 *   3. Ignore `EstimateStore` / `DbEstimateStore` entirely and delete them.
 *      They exist only so the in-memory adapter can reconstruct an estimate
 *      after a reload, by reading the deal row `bookDeal` wrote. A real Funnel
 *      is its own store of record and needs none of it. Note that this adapter
 *      writes nothing — the touchpoint on the Record timeline is `bookDeal`'s,
 *      and it stays exactly as it is after the swap.
 *   4. Map WOW Leads deal ids to Funnel deal ids if the Funnel does not accept
 *      ours. Add the mapping here, not in the caller.
 *
 * Environment variables a real integration will need (none are set today, and
 * none are read by the in-memory adapter):
 *   WOW_OS_API_URL       Base URL of the Funnel API.
 *   WOW_OS_API_TOKEN     Service token for the WOW Leads → Funnel machine user.
 *   WOW_OS_LOCATION_ID   Which location's Funnel to write into; today the app
 *                        is single-location (see `lib/current-user.ts`).
 * Add them to `.env.example` when you add them here.
 *
 * `getWowOsClient()` already switches on `WOW_OS_API_URL`, so wiring the real
 * client up is: implement the class, set the env vars, ship.
 */

import { eq } from "drizzle-orm";
import { deals } from "@/db/schema";
import { generateOsRef, isValidOsRef } from "./booking";

/**
 * `@/db` throws at import time when DATABASE_URL is unset, so it is imported
 * on first use rather than at module load. That keeps this module importable
 * from unit tests, which drive `InMemoryWowOsClient` against a
 * `MemoryEstimateStore` and never open a connection.
 */
async function database() {
  const { db } = await import("@/db");
  return db;
}

/* -------------------------------------------------------------------------
   The contract
   ------------------------------------------------------------------------- */

export interface CreateEstimateInput {
  dealId: string;
  leadName: string;
  /** Address (residential), site, or company line — the card's account line. */
  address: string;
  /** "Thu Aug 6 at 10:00 AM" */
  when: string;
  estimatorName: string;
  source: string;
  assignedBy: string;
  /** What carries across the seam — the chips shown in the modal. */
  carries: string[];
}

export type EstimateStatus =
  | "Estimate Scheduled"
  | "In Progress"
  | "Complete";

export interface EstimateRecord {
  osRef: string;
  status: EstimateStatus;
  when: string;
  estimator: string;
}

export interface WowOsClient {
  createEstimate(input: CreateEstimateInput): Promise<{ osRef: string }>;
  /**
   * Reads an estimate back out of the Funnel. Returns null for an `osRef` the
   * Funnel has never heard of — callers must handle that rather than assume a
   * round trip always succeeds.
   */
  getEstimateStatus(osRef: string): Promise<EstimateRecord | null>;
}



/* -------------------------------------------------------------------------
   Persistence port
   ------------------------------------------------------------------------- */

/**
 * REAL-INTEGRATION NOTE: this whole port disappears with the in-memory client.
 * A real Funnel API is its own store of record and needs none of it.
 *
 * It exists for two reasons: the in-memory adapter has to survive a page
 * reload, and a port makes the round trip unit-testable without a database.
 *
 * Note what is *not* here: a write. `bookDeal` already persists everything the
 * in-memory Funnel needs — `deals.os_ref` and, on `deals.next_due`, the
 * appointment as `"<when> · <estimator>"` — and it logs the Funnel-authored
 * JOB touchpoint that the Record timeline renders. This adapter used to write
 * its own near-identical JOB row on top of that, which put two almost-the-same
 * entries on the timeline one second apart. Reconstructing from the deal row
 * instead means one write, one timeline entry, and nothing to keep in sync.
 */
export interface EstimateStore {
  /** Is this ref already taken? Guards against a five-digit collision. */
  osRefExists(osRef: string): Promise<boolean>;
  /** Null when the Funnel has never heard of this ref. */
  load(osRef: string): Promise<StoredEstimate | null>;
  /**
   * Optional: only stores with no other source of truth implement this. The
   * database-backed store deliberately does not — see above.
   */
  save?(record: StoredEstimate): Promise<void>;
}

export interface StoredEstimate {
  osRef: string;
  dealId: string;
  when: string;
  estimator: string;
}

/** `bookDeal` writes `next_due` as `"<whenLabel> · <estimatorName>"`. */
function splitNextDue(nextDue: string | null): {
  when: string;
  estimator: string;
} {
  const at = nextDue?.indexOf(" · ") ?? -1;
  if (!nextDue || at === -1) {
    // A deal can carry an osRef seeded straight into the fixtures without ever
    // going through the booking flow (the demo's EST-40218 does). That estimate
    // is real — report it as scheduled with the detail we do not have.
    return { when: "Scheduled", estimator: "Unassigned" };
  }
  return {
    when: nextDue.slice(0, at),
    estimator: nextDue.slice(at + 3),
  };
}

/**
 * Durability for the in-memory adapter, read straight off the deal row that
 * `bookDeal` writes. Read-only by design.
 */
export class DbEstimateStore implements EstimateStore {
  async osRefExists(osRef: string): Promise<boolean> {
    const db = await database();
    const rows = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.osRef, osRef))
      .limit(1);
    return rows.length > 0;
  }

  async load(osRef: string): Promise<StoredEstimate | null> {
    const db = await database();
    const rows = await db
      .select({ id: deals.id, nextDue: deals.nextDue })
      .from(deals)
      .where(eq(deals.osRef, osRef))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return { osRef, dealId: row.id, ...splitNextDue(row.nextDue) };
  }
}

/** Store used by unit tests and by any caller that must not touch Postgres. */
export class MemoryEstimateStore implements EstimateStore {
  private readonly rows = new Map<string, StoredEstimate>();

  async osRefExists(osRef: string): Promise<boolean> {
    return this.rows.has(osRef);
  }

  async save(record: StoredEstimate): Promise<void> {
    this.rows.set(record.osRef, record);
  }

  async load(osRef: string): Promise<StoredEstimate | null> {
    return this.rows.get(osRef) ?? null;
  }
}
/* -------------------------------------------------------------------------
   In-memory implementation (the default, and the one v1 ships with)
   ------------------------------------------------------------------------- */

export class InMemoryWowOsClient implements WowOsClient {
  constructor(private readonly store: EstimateStore = new DbEstimateStore()) {}

  async createEstimate(
    input: CreateEstimateInput,
  ): Promise<{ osRef: string }> {
    const osRef = await this.mintUniqueOsRef();

    // Against the database-backed store this is a no-op: the caller runs
    // `bookDeal` immediately after, and that write is what makes the estimate
    // readable. In-memory stores (tests) have nowhere else to put it.
    await this.store.save?.({
      osRef,
      dealId: input.dealId,
      when: input.when,
      estimator: input.estimatorName,
    });

    return { osRef };
  }

  async getEstimateStatus(osRef: string): Promise<EstimateRecord | null> {
    if (!isValidOsRef(osRef)) return null;

    const stored = await this.store.load(osRef);
    if (!stored) return null;

    return {
      osRef,
      // The in-memory Funnel cannot advance an estimate past scheduling; only
      // the real Funnel knows about "In Progress" and "Complete".
      status: "Estimate Scheduled",
      when: stored.when,
      estimator: stored.estimator,
    };
  }

  /**
   * Five-digit refs collide roughly one time in sixty thousand. Cheap to rule
   * out, expensive to debug, so we check.
   */
  private async mintUniqueOsRef(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateOsRef();
      if (!(await this.store.osRefExists(candidate))) return candidate;
    }
    throw new Error(
      "Could not mint a unique osRef after 8 attempts — the EST-##### space is unexpectedly full.",
    );
  }
}

/* -------------------------------------------------------------------------
   Selection
   ------------------------------------------------------------------------- */

let singleton: WowOsClient | null = null;

/**
 * The one place the app chooses an implementation. When `WOW_OS_API_URL` is
 * set, return the real client here — that is the whole switch.
 */
export function getWowOsClient(): WowOsClient {
  if (!singleton) {
    // if (process.env.WOW_OS_API_URL) singleton = new HttpWowOsClient();
    singleton = new InMemoryWowOsClient();
  }
  return singleton;
}

/** Tests inject a fake and reset afterwards. */
export function __setWowOsClient(client: WowOsClient | null): void {
  singleton = client;
}

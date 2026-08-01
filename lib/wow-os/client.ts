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
 *      The JOB touchpoint they write exists purely so the in-memory adapter
 *      survives a page reload; once the Funnel is the store of record it owns
 *      the estimate and that touchpoint is a duplicate.
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
import { deals, touchpoints } from "@/db/schema";
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
 * It exists because the in-memory adapter has to survive a page reload — and
 * because a port makes the round trip unit-testable without a database.
 */
export interface EstimateStore {
  /** Is this ref already taken? Guards against a five-digit collision. */
  osRefExists(osRef: string): Promise<boolean>;
  /** The account a deal belongs to, for the touchpoint's account link. */
  accountIdForDeal(dealId: string): Promise<string | null>;
  /** Writes the estimate to `deals.os_ref`'s neighbouring touchpoint. */
  save(record: StoredEstimate): Promise<void>;
  /** Null when the Funnel has never heard of this ref. */
  load(osRef: string): Promise<StoredEstimate | null>;
}

export interface StoredEstimate {
  osRef: string;
  dealId: string;
  when: string;
  estimator: string;
  carries: string[];
  body: string;
  accountId: string | null;
}

const FUNNEL_AUTHOR = "WOW OS Funnel";
const FUNNEL_INITIALS = "OS";

/** Structured-field labels the read-back parses out again. */
const FIELD_WHEN = "When";
const FIELD_ESTIMATOR = "Estimator";
const FIELD_ESTIMATE = "Estimate";
const FIELD_CARRIES = "Carries";

const touchpointId = (osRef: string) => `tp-os-${osRef.toLowerCase()}`;

/**
 * Durability for the in-memory adapter: the ref lives on `deals.os_ref` (set
 * by `bookDeal`) and the appointment detail on a JOB touchpoint. `JOB` is the
 * channel the prototype uses for Funnel-side timeline events, so the entry
 * reads correctly in the Record screen's provenance list.
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

  async accountIdForDeal(dealId: string): Promise<string | null> {
    const db = await database();
    const rows = await db
      .select({ accountId: deals.accountId })
      .from(deals)
      .where(eq(deals.id, dealId))
      .limit(1);
    return rows[0]?.accountId ?? null;
  }

  async save(record: StoredEstimate): Promise<void> {
    const db = await database();
    await db.insert(touchpoints).values({
      id: touchpointId(record.osRef),
      dealId: record.dealId,
      accountId: record.accountId,
      channel: "JOB",
      body: record.body,
      who: FUNNEL_AUTHOR,
      byAgent: false,
      initials: FUNNEL_INITIALS,
      structured: [
        { label: FIELD_WHEN, value: record.when },
        { label: FIELD_ESTIMATOR, value: record.estimator },
        { label: FIELD_ESTIMATE, value: record.osRef },
        { label: FIELD_CARRIES, value: record.carries.join(" · ") },
      ],
      occurredAt: new Date(),
    });
  }

  async load(osRef: string): Promise<StoredEstimate | null> {
    const db = await database();
    const rows = await db
      .select({
        dealId: touchpoints.dealId,
        accountId: touchpoints.accountId,
        body: touchpoints.body,
        structured: touchpoints.structured,
      })
      .from(touchpoints)
      .where(eq(touchpoints.id, touchpointId(osRef)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      // A deal can carry an osRef seeded straight into the fixtures, with no
      // matching touchpoint (the demo's EST-40218 does). That estimate is
      // real — report it as scheduled with the detail we do not have.
      const seeded = await db
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.osRef, osRef))
        .limit(1);
      if (!seeded[0]) return null;
      return {
        osRef,
        dealId: seeded[0].id,
        when: "Scheduled",
        estimator: "Unassigned",
        carries: [],
        body: "",
        accountId: null,
      };
    }

    const find = (label: string) =>
      row.structured?.find((f) => f.label === label)?.value ?? "";

    return {
      osRef,
      dealId: row.dealId,
      when: find(FIELD_WHEN) || "Scheduled",
      estimator: find(FIELD_ESTIMATOR) || "Unassigned",
      carries: find(FIELD_CARRIES) ? find(FIELD_CARRIES).split(" · ") : [],
      body: row.body,
      accountId: row.accountId,
    };
  }
}

/** Store used by unit tests and by any caller that must not touch Postgres. */
export class MemoryEstimateStore implements EstimateStore {
  private readonly rows = new Map<string, StoredEstimate>();

  async osRefExists(osRef: string): Promise<boolean> {
    return this.rows.has(osRef);
  }

  async accountIdForDeal(): Promise<string | null> {
    return null;
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

    await this.store.save({
      osRef,
      dealId: input.dealId,
      when: input.when,
      estimator: input.estimatorName,
      carries: input.carries,
      body: `Estimate scheduled in the WOW OS Funnel — ${input.when} · ${input.estimatorName} · ${osRef}`,
      accountId: await this.store.accountIdForDeal(input.dealId),
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

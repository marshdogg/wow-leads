/**
 * The provenance trail. Every mutating repository function appends here, and
 * the Record screen's timeline reads straight off `audit_events` — so if a
 * write does not call `appendAudit`, it never happened as far as the product
 * is concerned.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import type { AuditEvent } from "@/lib/types";

export interface AppendAuditInput {
  /** deal | approval | touchpoint | account | contact | user */
  entity: string;
  entityId: string;
  action: string;
  /** Exactly one of userId / agentId. */
  userId?: string | null;
  agentId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function appendAudit(input: AppendAuditInput): Promise<void> {
  const userId = input.userId ?? null;
  const agentId = input.agentId ?? null;
  if (userId && agentId) {
    throw new Error(
      `appendAudit: ${input.entity}/${input.entityId} named both a user and an agent — provenance must be one or the other.`,
    );
  }
  if (!userId && !agentId) {
    throw new Error(
      `appendAudit: ${input.entity}/${input.entityId} named no actor — every write has an author.`,
    );
  }

  await db.insert(auditEvents).values({
    id: `aud-${crypto.randomUUID()}`,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    userId,
    agentId,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}

/** Newest-first provenance for one entity. */
export async function getAuditTrail(
  entity: string,
  entityId: string,
  limit = 50,
): Promise<AuditEvent[]> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entity, entity), eq(auditEvents.entityId, entityId)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entityId,
    action: r.action,
    userId: r.userId,
    agentId: r.agentId,
    before: r.before,
    after: r.after,
    createdAt: r.createdAt,
  }));
}

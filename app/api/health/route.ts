import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

interface CountRow extends Record<string, unknown> {
  table_name: string;
  n: number;
}

/** GET /api/health — database connectivity plus a row count per table. */
export async function GET() {
  const startedAt = Date.now();
  try {
    const result = await db.execute<CountRow>(sql`
      select 'locations' as table_name, count(*)::int as n from locations
      union all select 'users', count(*)::int from users
      union all select 'pipelines', count(*)::int from pipelines
      union all select 'stages', count(*)::int from stages
      union all select 'accounts', count(*)::int from accounts
      union all select 'contacts', count(*)::int from contacts
      union all select 'access_notes', count(*)::int from access_notes
      union all select 'sequences', count(*)::int from sequences
      union all select 'sequence_steps', count(*)::int from sequence_steps
      union all select 'promos', count(*)::int from promos
      union all select 'deals', count(*)::int from deals
      union all select 'touchpoints', count(*)::int from touchpoints
      union all select 'approvals', count(*)::int from approvals
      union all select 'audit_events', count(*)::int from audit_events
    `);

    const rows: CountRow[] = Array.isArray(result) ? result : result.rows;
    const counts = Object.fromEntries(rows.map((r) => [r.table_name, r.n]));

    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      counts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : "Database unreachable.",
      },
      { status: 503 },
    );
  }
}

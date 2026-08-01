import { NextResponse } from "next/server";
import { getAccountView } from "@/lib/repositories/accounts";
import { getAuditTrail } from "@/lib/repositories/audit";

export const dynamic = "force-dynamic";

/** GET /api/deals/:id — the full record view plus its provenance trail. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const view = await getAccountView(id);
  if (!view) {
    return NextResponse.json({ error: `Deal "${id}" not found.` }, { status: 404 });
  }
  const audit = await getAuditTrail("deal", id);
  return NextResponse.json({ ...view, audit });
}

import { NextResponse } from "next/server";
import { getPipelines } from "@/lib/repositories/pipelines";

export const dynamic = "force-dynamic";

/** GET /api/pipelines — pipeline and stage configuration as stored. */
export async function GET() {
  const pipelines = await getPipelines();
  return NextResponse.json({ count: pipelines.length, pipelines });
}

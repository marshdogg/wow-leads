import { NextResponse } from "next/server";
import { getAllDeals, getDealsByPipeline } from "@/lib/repositories/deals";
import { PIPELINE_IDS } from "@/lib/pipelines";
import type { PipelineId } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/deals?pipe=comm — read-only, for debugging and the OS adapter. */
export async function GET(request: Request) {
  const pipe = new URL(request.url).searchParams.get("pipe");

  if (pipe && !PIPELINE_IDS.includes(pipe as PipelineId)) {
    return NextResponse.json(
      { error: `Unknown pipeline "${pipe}".` },
      { status: 400 },
    );
  }

  const deals = pipe
    ? await getDealsByPipeline(pipe as PipelineId)
    : await getAllDeals();

  return NextResponse.json({ count: deals.length, deals });
}

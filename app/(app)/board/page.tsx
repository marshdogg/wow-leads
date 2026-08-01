import type { SearchParams } from "nuqs/server";
import { BoardScreen } from "@/components/board/BoardScreen";
import type { BoardStat } from "@/components/board/KpiStrip";
import { loadBoardSearchParams } from "@/components/board/search-params";
import { getBoardStats } from "@/lib/repositories/analytics";
import { getDealsByPipeline } from "@/lib/repositories/deals";
import { getPipelines } from "@/lib/repositories/pipelines";
import { getBoardPrefs } from "@/lib/repositories/users";
import { getCurrentUser } from "@/lib/current-user";
import { PIPELINE_IDS, PIPES } from "@/lib/pipelines";
import type { BoardPrefs, Deal, PipelineConfig, PipelineId } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_PREFS: BoardPrefs = {
  collapsedCols: {},
  listSort: { key: "next", dir: 1 },
};

interface BoardData {
  pipelines: PipelineConfig[];
  deals: Deal[];
  stats: BoardStat[];
  prefs: BoardPrefs;
}

/**
 * The board is the app's default route, so it has to render before the first
 * migration and seed land — the same trade the app shell makes. A failed read
 * degrades to the seeded pipeline config with no deals rather than a 500.
 */
async function loadBoard(pipe: PipelineId, userId: string): Promise<BoardData> {
  try {
    const [pipelines, deals, stats, prefs] = await Promise.all([
      getPipelines(),
      getDealsByPipeline(pipe),
      getBoardStats(pipe),
      getBoardPrefs(userId),
    ]);
    return { pipelines, deals, stats, prefs };
  } catch {
    return {
      pipelines: PIPELINE_IDS.map((id) => PIPES[id]),
      deals: [],
      stats: [],
      prefs: DEFAULT_PREFS,
    };
  }
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { pipeline } = await loadBoardSearchParams(searchParams);
  const user = getCurrentUser();
  const { pipelines, deals, stats, prefs } = await loadBoard(pipeline, user.id);
  const config = pipelines.find((p) => p.id === pipeline) ?? PIPES[pipeline];

  return (
    // Keying on the pipeline drops the previous pipeline's optimistic deal
    // state instead of trying to reconcile it against a different stage set.
    <BoardScreen
      key={pipeline}
      pipelines={pipelines}
      pipeline={config}
      deals={deals}
      stats={stats}
      prefs={prefs}
    />
  );
}

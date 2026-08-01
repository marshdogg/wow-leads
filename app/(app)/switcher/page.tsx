import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { BoardScreen } from "@/components/board/BoardScreen";
import type { BoardStat } from "@/components/board/KpiStrip";
import { loadBoardSearchParams } from "@/components/board/search-params";
import { getBoardStats } from "@/lib/repositories/analytics";
import { getDealsByPipeline } from "@/lib/repositories/deals";
import { getPipelines } from "@/lib/repositories/pipelines";
import { getBoardPrefs } from "@/lib/repositories/users";
import { getCurrentUser } from "@/lib/current-user";
import { PIPES } from "@/lib/pipelines";
import type { BoardPrefs, Deal, PipelineConfig, PipelineId } from "@/lib/types";
import { SwitcherIntro } from "./SwitcherIntro";

export const dynamic = "force-dynamic";

/**
 * The Switcher exists to prove one claim: the board is pipeline-generic. So it
 * must not be a second board. It renders the *same* `BoardScreen` the Pipelines
 * screen renders, given a different set of pipelines — if this screen and
 * `/board` ever diverge, the claim is false and the divergence is the bug.
 *
 * Residential is deliberately excluded. It is the pipeline everything else was
 * modelled on, so showing it proves nothing; the three shown here each differ
 * structurally — Commercial has six stages and `$XXXK in stage` roll-ups, Biz
 * Dev has three stages and sequence bars, Partner has four relationship stages
 * with REFERRALS SENT / ATTRIBUTED metrics.
 */
const SWITCHER_PIPELINES: PipelineId[] = ["comm", "bizdev", "partner"];
const DEFAULT_PIPELINE: PipelineId = "comm";

const DEFAULT_PREFS: BoardPrefs = {
  collapsedCols: {},
  listSort: { key: "next", dir: 1 },
};

interface SwitcherData {
  pipelines: PipelineConfig[];
  deals: Deal[];
  stats: BoardStat[];
  prefs: BoardPrefs;
}

async function loadSwitcher(
  pipe: PipelineId,
  userId: string,
): Promise<SwitcherData> {
  try {
    const [pipelines, deals, stats, prefs] = await Promise.all([
      getPipelines(),
      getDealsByPipeline(pipe),
      getBoardStats(pipe),
      getBoardPrefs(userId),
    ]);
    return {
      // The selector only ever offers the three — passing a filtered list is
      // the whole difference between this screen and the board.
      pipelines: pipelines.filter((p) => SWITCHER_PIPELINES.includes(p.id)),
      deals,
      stats,
      prefs,
    };
  } catch {
    return {
      pipelines: SWITCHER_PIPELINES.map((id) => PIPES[id]),
      deals: [],
      stats: [],
      prefs: DEFAULT_PREFS,
    };
  }
}

export default async function SwitcherPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { pipeline } = await loadBoardSearchParams(searchParams);

  // `pipelineParser` defaults to `resi`, which this screen does not show. Put a
  // real pipeline in the URL so the selector always has a match and a reload
  // lands where you left off.
  if (!SWITCHER_PIPELINES.includes(pipeline)) {
    redirect(`/switcher?pipeline=${DEFAULT_PIPELINE}`);
  }

  const user = getCurrentUser();
  const { pipelines, deals, stats, prefs } = await loadSwitcher(
    pipeline,
    user.id,
  );
  const config = pipelines.find((p) => p.id === pipeline) ?? PIPES[pipeline];

  return (
    <>
      <SwitcherIntro />
      <BoardScreen
        key={pipeline}
        pipelines={pipelines}
        pipeline={config}
        deals={deals}
        stats={stats}
        prefs={prefs}
      />
    </>
  );
}

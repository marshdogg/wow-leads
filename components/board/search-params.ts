import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { PIPELINE_IDS } from "@/lib/pipelines";
import type { BoardView, PipelineId, TrackFilterId } from "@/lib/types";

/**
 * Board view state lives in the URL so a reload — or a Playwright test —
 * lands on exactly the view you were looking at.
 *
 * Only `pipeline` is a server concern: changing it changes which deals are
 * fetched, so it opts out of shallow routing. `track` and `view` filter and
 * re-render what the client already holds, so they stay shallow and instant.
 */

const TRACK_FILTER_IDS = ["all", "referral", "repeat", "revival"] as const;
const BOARD_VIEWS = ["board", "list"] as const;

export const pipelineParser = parseAsStringLiteral(
  PIPELINE_IDS as PipelineId[],
)
  .withDefault("resi")
  .withOptions({ shallow: false, history: "push" });

export const trackParser =
  parseAsStringLiteral(TRACK_FILTER_IDS).withDefault("all");

export const viewParser =
  parseAsStringLiteral(BOARD_VIEWS).withDefault("board");

export const boardSearchParams = {
  pipeline: pipelineParser,
  track: trackParser,
  view: viewParser,
};

export const loadBoardSearchParams = createLoader(boardSearchParams);

export type BoardUrlState = {
  pipeline: PipelineId;
  track: TrackFilterId;
  view: BoardView;
};

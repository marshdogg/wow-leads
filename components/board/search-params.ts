import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { LEAD_SOURCES, PIPELINE_IDS, PIPES } from "@/lib/pipelines";
import type { BoardView, PipelineId, TrackFilterId } from "@/lib/types";

/**
 * Board view state lives in the URL so a reload — or a Playwright test —
 * lands on exactly the view you were looking at.
 *
 * Only `pipeline` is a server concern: changing it changes which deals are
 * fetched, so it opts out of shallow routing. `track` and `view` filter and
 * re-render what the client already holds, so they stay shallow and instant.
 */

/**
 * Every track id any pipeline offers, derived rather than re-listed — a new
 * pipeline with new tracks widens the accepted URL values on its own.
 *
 * `PIPES` is the seeded config rather than the database, which is right here:
 * a parser is a module-level constant and can't await a query, and `PIPES` is
 * the canonical starting state. `"all"` is seeded explicitly so the parser's
 * own default stays valid even if no pipeline currently has tracks.
 */
const TRACK_FILTER_IDS: TrackFilterId[] = Array.from(
  new Set<TrackFilterId>([
    "all",
    ...Object.values(PIPES).flatMap((p) => p.trackOptions.map((t) => t.id)),
  ]),
);

const BOARD_VIEWS = ["board", "list"] as const;

/**
 * Source filter values, derived from the catalogue so a channel added to
 * `LEAD_SOURCE_GROUPS` is immediately filterable without touching this file.
 */
const SOURCE_FILTER_IDS: string[] = ["all", ...LEAD_SOURCES];

export const pipelineParser = parseAsStringLiteral(
  PIPELINE_IDS as PipelineId[],
)
  .withDefault("resi")
  .withOptions({ shallow: false, history: "push" });

export const trackParser =
  parseAsStringLiteral(TRACK_FILTER_IDS).withDefault("all");

export const viewParser =
  parseAsStringLiteral(BOARD_VIEWS).withDefault("board");

export const sourceParser =
  parseAsStringLiteral(SOURCE_FILTER_IDS).withDefault("all");

export const boardSearchParams = {
  pipeline: pipelineParser,
  track: trackParser,
  view: viewParser,
  source: sourceParser,
};

export const loadBoardSearchParams = createLoader(boardSearchParams);

export type BoardUrlState = {
  pipeline: PipelineId;
  track: TrackFilterId;
  view: BoardView;
  /** A `LeadSource` value, or "all". */
  source: string;
};

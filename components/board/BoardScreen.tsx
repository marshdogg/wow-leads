"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryState, useQueryStates } from "nuqs";
import { moveDealAction } from "@/app/actions/deals";
import { saveBoardPrefsAction } from "@/app/actions/prefs";
import { ListTable } from "@/components/list/ListTable";
import { useUi } from "@/lib/store/ui";
import {
  stageLabel,
  stageRequiresReason,
  stageRequiresRevisitDate,
} from "@/lib/pipelines";
import type {
  BoardPrefs,
  Deal,
  ListSort,
  LostReason,
  PipelineConfig,
  PipelineId,
  StageId,
} from "@/lib/types";
import { BoardColumns } from "./BoardColumns";
import { LostReasonModal } from "./LostReasonModal";
import { RevisitDateModal } from "./RevisitDateModal";
import { BoardHeader } from "./BoardHeader";
import { KpiStrip, type BoardStat } from "./KpiStrip";
import { PipelineSelector } from "./PipelineSelector";
import {
  pipelineParser,
  sourceParser,
  trackParser,
  viewParser,
} from "./search-params";

/**
 * A move a stage will not accept until its question is answered.
 *
 * Both answers are carried on one object rather than one per modal, so "what
 * is still missing" is a property of the move rather than of whichever dialog
 * happens to be open.
 */
interface PendingMove {
  dealId: string;
  dealName: string;
  stageId: StageId;
  stageLabel: string;
  needsReason: boolean;
  needsDate: boolean;
  lostReason?: LostReason;
  /** `YYYY-MM-DD`; parsed to a real date at the action boundary. */
  revisitDate?: string;
}

/**
 * The board is pipeline-generic: all four pipelines render through this one
 * component, differing only in the stage list, the KPI strip and whether the
 * track filter and `$ in stage` roll-ups appear.
 *
 * Split of responsibilities:
 * - `pipeline`, `track` and `view` are *view state* and live in the URL.
 * - collapse and list sort are *preferences* and live per user in the database.
 * - deals are server state, held here only so a drag can be optimistic.
 */
export function BoardScreen({
  pipelines,
  pipeline,
  deals: initialDeals,
  stats,
  prefs,
  pipelineParam = "pipeline",
  testIdPrefix,
  showPipelineSelector = true,
}: {
  pipelines: PipelineConfig[];
  pipeline: PipelineConfig;
  deals: Deal[];
  stats: BoardStat[];
  prefs: BoardPrefs;
  /**
   * Query-param name holding the selected pipeline. The Switcher renders this
   * same board at `/switcher?pipe=comm` and must not write `/board`'s param.
   */
  pipelineParam?: string;
  /** Test-id prefix for the selector cards. Defaults to `pipeline-<id>`. */
  testIdPrefix?: string;
  /**
   * `/board` switches pipelines from the left rail's category groups and hides
   * this. The Switcher has no rail category of its own, so it keeps the
   * selector — hence the default, which leaves that screen untouched.
   */
  showPipelineSelector?: boolean;
}) {
  const [pipe, setPipe] = useQueryState(pipelineParam, pipelineParser);
  const [{ track, view, source }, setViewState] = useQueryStates(
    { track: trackParser, view: viewParser, source: sourceParser },
    { history: "replace" },
  );

  const showToast = useUi((s) => s.showToast);
  const [deals, setDeals] = useState(initialDeals);
  const [collapsedCols, setCollapsedCols] = useState(prefs.collapsedCols);
  const [listSort, setListSort] = useState(prefs.listSort);
  const [pending, startTransition] = useTransition();

  /** The move waiting on an answer, or null. See `move`. */
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const stages = pipeline.stages;
  const colKey = (stageId: StageId) => `${pipeline.id}:${stageId}`;

  // Keyed off the same thing the header renders from, so a pipeline can never
  // show a track control that doesn't filter, or filter with no control.
  const hasTracks = pipeline.trackOptions.length > 0;

  // Which sources this pipeline's deals actually use. Offering the full
  // catalogue would list two dozen channels a board has never seen; offering
  // only what's present keeps the menu honest and short.
  const sourceOptions = useMemo(
    () => Array.from(new Set(deals.map((d) => d.source))).sort(),
    [deals],
  );

  const visible = useMemo(() => {
    let out = deals;
    if (hasTracks && track !== "all") out = out.filter((d) => d.track === track);
    if (source !== "all") out = out.filter((d) => d.source === source);
    return out;
  }, [deals, hasTracks, track, source]);

  /** Stage-keyed view of the global `pipeline:stage` collapse map. */
  const collapsedByStage = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const stage of stages) {
      out[stage.id] = Boolean(collapsedCols[`${pipeline.id}:${stage.id}`]);
    }
    return out;
  }, [collapsedCols, stages, pipeline.id]);

  const anyExpanded = stages.some((s) => !collapsedByStage[s.id]);

  /**
   * Sends only the key that changed. Rebuilding the whole document from local
   * state meant a sort save wrote back whatever `collapsedCols` this component
   * happened to hold — which, on the list view, is what the page loaded before
   * a collapse on the board had landed. The repository merges.
   */
  function persist(next: Partial<BoardPrefs>) {
    startTransition(async () => {
      await saveBoardPrefsAction(next);
    });
  }

  function toggleColumn(stageId: StageId) {
    const next = {
      ...collapsedCols,
      [colKey(stageId)]: !collapsedCols[colKey(stageId)],
    };
    setCollapsedCols(next);
    persist({ collapsedCols: next });
  }

  function toggleAll() {
    // Only the current pipeline's columns change — another pipeline's collapse
    // state is a separate preference and survives untouched.
    const next = { ...collapsedCols };
    for (const stage of stages) next[colKey(stage.id)] = anyExpanded;
    setCollapsedCols(next);
    persist({ collapsedCols: next });
  }

  function changeSort(sort: ListSort) {
    setListSort(sort);
    persist({ listSort: sort });
  }

  function selectPipeline(id: PipelineId) {
    // Selecting a pipeline always resets the track filter.
    void setPipe(id);
    void setViewState({ track: "all" });
  }

  /**
   * Every route into a stage passes through here — drag-and-drop today, and
   * anything added later — which is why the gates live at this level rather
   * than inside the drag handler.
   *
   * Two stage types ask a question before they will accept a card, and both
   * are asked *before* the optimistic update. A card that lands in Lost and
   * then springs back if you cancel reads as a failed drag rather than an
   * unanswered question, and both answers are load-bearing: the reason is what
   * the revival trigger fires on, the date is the only thing that brings a
   * paused deal back after it drops out of the neglect alert.
   *
   * A stage can in principle demand both (a franchise setting both flags; no
   * shipped stage does). The prompts are therefore driven off what is still
   * missing rather than off which modal is open, so they queue naturally.
   */
  function move(dealId: string, stageId: StageId) {
    const deal = deals.find((d) => d.id === dealId);
    const target = stages.find((s) => s.id === stageId);
    if (!deal || !target) return;

    const request: PendingMove = {
      dealId,
      dealName: deal.name,
      stageId,
      stageLabel: target.label,
      needsReason: stageRequiresReason(target),
      needsDate: stageRequiresRevisitDate(target),
    };

    if (request.needsReason || request.needsDate) {
      setPendingMove(request);
      return;
    }
    commitMove(request);
  }

  /** Answers gathered so far; commits once nothing is outstanding. */
  function answer(next: Partial<PendingMove>) {
    if (!pendingMove) return;
    const merged = { ...pendingMove, ...next };
    setPendingMove(merged);
    const outstanding =
      (merged.needsReason && !merged.lostReason) ||
      (merged.needsDate && !merged.revisitDate);
    if (!outstanding) commitMove(merged);
  }

  function commitMove(request: PendingMove) {
    const before = deals;
    const deal = deals.find((d) => d.id === request.dealId);
    if (!deal) return;

    setDeals((current) =>
      current.map((d) =>
        d.id === request.dealId ? { ...d, stage: request.stageId } : d,
      ),
    );

    startTransition(async () => {
      const res = await moveDealAction({
        dealId: request.dealId,
        stageId: request.stageId,
        ...(request.lostReason ? { lostReason: request.lostReason } : {}),
        ...(request.revisitDate ? { revisitDate: request.revisitDate } : {}),
      });
      if (res.ok) {
        setDeals((current) =>
          current.map((d) => (d.id === request.dealId ? res.deal : d)),
        );
        setPendingMove(null);
        showToast(
          request.lostReason
            ? `${deal.name} marked lost · ${request.lostReason}`
            : request.revisitDate
              ? `${deal.name} paused until ${request.revisitDate}`
              : `${deal.name} → ${stageLabel(pipeline.id, request.stageId)}`,
        );
      } else {
        setDeals(before);
        // The prompt stays open on failure. Closing it would throw away a
        // considered answer and leave the card silently unmoved.
        showToast(res.error);
      }
    });
  }

  return (
    // Row from md up — panel beside the board. Below md it stacks, so the
    // panel becomes a horizontal strip above the content instead of a third
    // column, which a 390px phone has no room for.
    <div
      className="flex flex-col md:flex-row"
      style={{
        flex: 1,
        // A flex item defaults to min-width:auto and will not shrink below its
        // content, so without this the widest row (the header controls) sets
        // the page width and drags the whole layout sideways on a phone.
        minWidth: 0,
        minHeight: 560,
      }}
    >
      {showPipelineSelector && (
        <PipelineSelector
          pipelines={pipelines}
          selected={pipe}
          onSelect={selectPipeline}
          testIdPrefix={testIdPrefix}
        />
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <BoardHeader
          pipeline={pipeline}
          track={track}
          onTrack={(t) => void setViewState({ track: t })}
          source={source}
          sourceOptions={sourceOptions}
          onSource={(v) => void setViewState({ source: v })}
          view={view}
          onView={(v) => void setViewState({ view: v })}
          anyExpanded={anyExpanded}
          onToggleAll={toggleAll}
        />

        <KpiStrip stats={stats} />

        {view === "board" ? (
          <BoardColumns
            pipe={pipeline.id}
            stages={stages}
            deals={visible}
            collapsed={collapsedByStage}
            onToggle={toggleColumn}
            onMove={move}
          />
        ) : (
          <ListTable
            pipeline={pipeline}
            stages={stages}
            deals={visible}
            sort={listSort}
            onSort={changeSort}
          />
        )}
      </div>

      {/* Driven off what is still outstanding, so a stage demanding both asks
          for the reason and then the date without either modal knowing about
          the other. */}
      <LostReasonModal
        request={
          pendingMove?.needsReason && !pendingMove.lostReason
            ? pendingMove
            : null
        }
        pending={pending}
        onConfirm={(lostReason) => answer({ lostReason })}
        onCancel={() => setPendingMove(null)}
      />

      <RevisitDateModal
        request={
          pendingMove?.needsDate &&
          !pendingMove.revisitDate &&
          !(pendingMove.needsReason && !pendingMove.lostReason)
            ? pendingMove
            : null
        }
        pending={pending}
        onConfirm={(revisitDate) => answer({ revisitDate })}
        onCancel={() => setPendingMove(null)}
      />
    </div>
  );
}

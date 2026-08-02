"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryState, useQueryStates } from "nuqs";
import { moveDealAction } from "@/app/actions/deals";
import { saveBoardPrefsAction } from "@/app/actions/prefs";
import { ListTable } from "@/components/list/ListTable";
import { useUi } from "@/lib/store/ui";
import { stageLabel, stageRequiresReason } from "@/lib/pipelines";
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
import { LostReasonModal, type LostReasonRequest } from "./LostReasonModal";
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

  /** The move waiting on a lost reason, or null. See `move`. */
  const [lostRequest, setLostRequest] = useState<LostReasonRequest | null>(
    null,
  );

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
   * anything added later — which is why the reason gate lives at this level
   * rather than inside the drag handler.
   */
  function move(dealId: string, stageId: StageId) {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    const target = stages.find((s) => s.id === stageId);
    if (target && stageRequiresReason(target)) {
      // Deliberately *before* the optimistic update. A card that lands in Lost
      // and then springs back if you cancel reads as a failed drag rather than
      // an unanswered question, and the answer is what the revival trigger
      // runs on — it deserves a decision, not a dismissal.
      setLostRequest({
        dealId,
        dealName: deal.name,
        stageId,
        stageLabel: target.label,
      });
      return;
    }

    commitMove(dealId, stageId);
  }

  function commitMove(
    dealId: string,
    stageId: StageId,
    lostReason?: LostReason,
  ) {
    const before = deals;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    setDeals((current) =>
      current.map((d) => (d.id === dealId ? { ...d, stage: stageId } : d)),
    );

    startTransition(async () => {
      const res = await moveDealAction({
        dealId,
        stageId,
        ...(lostReason ? { lostReason } : {}),
      });
      if (res.ok) {
        setDeals((current) =>
          current.map((d) => (d.id === dealId ? res.deal : d)),
        );
        setLostRequest(null);
        showToast(
          lostReason
            ? `${deal.name} marked lost · ${lostReason}`
            : `${deal.name} → ${stageLabel(pipeline.id, stageId)}`,
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

      <LostReasonModal
        request={lostRequest}
        pending={pending}
        onConfirm={(reason) => {
          if (!lostRequest) return;
          commitMove(
            lostRequest.dealId,
            lostRequest.stageId as StageId,
            reason,
          );
        }}
        onCancel={() => setLostRequest(null)}
      />
    </div>
  );
}

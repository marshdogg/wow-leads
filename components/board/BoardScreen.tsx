"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryState, useQueryStates } from "nuqs";
import { moveDealAction } from "@/app/actions/deals";
import { saveBoardPrefsAction } from "@/app/actions/prefs";
import { ListTable } from "@/components/list/ListTable";
import { useUi } from "@/lib/store/ui";
import { stageLabel } from "@/lib/pipelines";
import type {
  BoardPrefs,
  Deal,
  ListSort,
  PipelineConfig,
  PipelineId,
  StageId,
} from "@/lib/types";
import { BoardColumns } from "./BoardColumns";
import { BoardHeader } from "./BoardHeader";
import { KpiStrip, type BoardStat } from "./KpiStrip";
import { PipelineSelector } from "./PipelineSelector";
import { pipelineParser, trackParser, viewParser } from "./search-params";

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
}) {
  const [pipe, setPipe] = useQueryState(pipelineParam, pipelineParser);
  const [{ track, view }, setViewState] = useQueryStates(
    { track: trackParser, view: viewParser },
    { history: "replace" },
  );

  const showToast = useUi((s) => s.showToast);
  const [deals, setDeals] = useState(initialDeals);
  const [collapsedCols, setCollapsedCols] = useState(prefs.collapsedCols);
  const [listSort, setListSort] = useState(prefs.listSort);
  const [, startTransition] = useTransition();

  const stages = pipeline.stages;
  const colKey = (stageId: StageId) => `${pipeline.id}:${stageId}`;

  const visible = useMemo(
    () =>
      pipeline.tracks && track !== "all"
        ? deals.filter((d) => d.track === track)
        : deals,
    [deals, pipeline.tracks, track],
  );

  /** Stage-keyed view of the global `pipeline:stage` collapse map. */
  const collapsedByStage = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const stage of stages) {
      out[stage.id] = Boolean(collapsedCols[`${pipeline.id}:${stage.id}`]);
    }
    return out;
  }, [collapsedCols, stages, pipeline.id]);

  const anyExpanded = stages.some((s) => !collapsedByStage[s.id]);

  function persist(next: Partial<BoardPrefs>) {
    const prefsNext: BoardPrefs = {
      collapsedCols,
      listSort,
      ...next,
    };
    startTransition(async () => {
      await saveBoardPrefsAction(prefsNext);
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

  function move(dealId: string, stageId: StageId) {
    const before = deals;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    setDeals((current) =>
      current.map((d) => (d.id === dealId ? { ...d, stage: stageId } : d)),
    );

    startTransition(async () => {
      const res = await moveDealAction({ dealId, stageId });
      if (res.ok) {
        setDeals((current) =>
          current.map((d) => (d.id === dealId ? res.deal : d)),
        );
        showToast(`${deal.name} → ${stageLabel(pipeline.id, stageId)}`);
      } else {
        setDeals(before);
        showToast(res.error);
      }
    });
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 560,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PipelineSelector
        pipelines={pipelines}
        selected={pipe}
        onSelect={selectPipeline}
        testIdPrefix={testIdPrefix}
      />

      <BoardHeader
        pipeline={pipeline}
        track={track}
        onTrack={(t) => void setViewState({ track: t })}
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
  );
}

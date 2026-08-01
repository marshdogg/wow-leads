"use client";

import { ChevronDown, ChevronUp, Columns3, List } from "lucide-react";
import type { BoardView, PipelineConfig, TrackFilterId } from "@/lib/types";

/**
 * Title and subtitle on the left; controls on the right in a fixed order —
 * tracks, filter, collapse-all, then the Board/List toggle. The toggle is last
 * so it never shifts when the collapse-all button disappears in list view.
 */
export function BoardHeader({
  pipeline,
  track,
  onTrack,
  view,
  onView,
  anyExpanded,
  onToggleAll,
}: {
  pipeline: PipelineConfig;
  track: TrackFilterId;
  onTrack: (t: TrackFilterId) => void;
  view: BoardView;
  onView: (v: BoardView) => void;
  anyExpanded: boolean;
  onToggleAll: () => void;
}) {
  const AllCaret = anyExpanded ? ChevronUp : ChevronDown;

  return (
    <div
      className="px-4 sm:px-7"
      style={{
        flex: "none",
        paddingTop: 18,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {/* The rail groups pipelines under this category, so the title drops
            the "Residential" half and the eyebrow carries it here. */}
        <div
          data-testid="board-category"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.9px",
            color: "#6f7a6f",
            marginBottom: 6,
          }}
        >
          {pipeline.category}
        </div>
        <h1
          data-testid="board-title"
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.5px",
          }}
        >
          {pipeline.title}
        </h1>
        <div style={{ fontSize: 13, color: "#7d877d", marginTop: 3 }}>
          {pipeline.sub}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: "none",
          // `flex: none` sizes this row to max-content, so on a phone it stays
          // 905px wide and its own flex-wrap never fires. Capping it at the
          // container width lets the wrap happen; above md there is room to
          // spare, so the cap is never binding and the row is unchanged.
          maxWidth: "100%",
          flexWrap: "wrap",
        }}
      >
        {/* Track sets are per-pipeline: Residential has referral/repeat/
            revival, New Leads has its own sources, the rest have none and
            render no control at all. */}
        {pipeline.trackOptions.length > 0 && (
          <div
            role="group"
            aria-label="Track filter"
            data-testid="track-filter"
            style={{
              display: "flex",
              flexWrap: "wrap",
              background: "#141814",
              border: "1px solid #262b25",
              borderRadius: 10,
              padding: 4,
              gap: 3,
            }}
          >
            {pipeline.trackOptions.map((t) => (
              <SegmentedItem
                key={t.id}
                active={track === t.id}
                onClick={() => onTrack(t.id)}
                testId={`track-${t.id}`}
              >
                {t.label}
              </SegmentedItem>
            ))}
          </div>
        )}

        <button
          type="button"
          className="hover:!border-[#3b423a]"
          style={{
            fontSize: 13,
            color: "#c6cdc6",
            background: "#141814",
            border: "1px solid #262b25",
            borderRadius: 10,
            padding: "11px 15px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <span>{pipeline.filter}</span>
          <ChevronDown size={13} strokeWidth={2} aria-hidden color="#5c655c" />
        </button>

        {view === "board" && (
          <button
            type="button"
            onClick={onToggleAll}
            data-testid="collapse-all"
            className="hover:!border-[#4b9c2d] hover:!text-[#b6f07a]"
            style={{
              fontSize: 13,
              color: "#c6cdc6",
              background: "#141814",
              border: "1px solid #262b25",
              borderRadius: 10,
              padding: "11px 15px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <AllCaret size={12} strokeWidth={2.5} aria-hidden color="#7d877d" />
            {anyExpanded ? "Collapse all" : "Expand all"}
          </button>
        )}

        <div
          role="group"
          aria-label="Board or list"
          style={{
            display: "flex",
            flexWrap: "wrap",
            background: "#141814",
            border: "1px solid #262b25",
            borderRadius: 10,
            padding: 4,
            gap: 3,
            flex: "none",
          }}
        >
          <SegmentedItem
            active={view === "board"}
            onClick={() => onView("board")}
            testId="view-board"
          >
            <Columns3 size={13} strokeWidth={2} aria-hidden />
            Board
          </SegmentedItem>
          <SegmentedItem
            active={view === "list"}
            onClick={() => onView("list")}
            testId="view-list"
          >
            <List size={13} strokeWidth={2} aria-hidden />
            List
          </SegmentedItem>
        </div>
      </div>
    </div>
  );
}

function SegmentedItem({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 14px",
        border: "none",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 500,
        background: active ? "#1f2f16" : "transparent",
        color: active ? "#d5f8a8" : "#98a298",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

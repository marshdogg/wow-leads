"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, EllipsisVertical } from "lucide-react";
import { AiDraftChip, TrackChip } from "@/components/card/TrackChip";
import { OwnerBadge } from "@/components/card/OwnerBadge";
import { AUTOMATED_TRACK_STYLE, TRACK_STYLE } from "@/lib/pipelines";
import type {
  Deal,
  ListSort,
  ListSortKey,
  PipelineConfig,
  StageConfig,
} from "@/lib/types";
import { nextSort, sortDeals } from "./sort";

const GRID = "2.1fr 1.05fr 1fr 1.5fr 1.1fr 0.85fr 40px";

const HEADS: { id: ListSortKey; label: string; align?: "right" }[] = [
  { id: "name", label: "LEAD" },
  { id: "track", label: "TRACK" },
  { id: "stage", label: "STAGE" },
  { id: "next", label: "NEXT ACTION" },
  { id: "owner", label: "OWNER" },
  { id: "stale", label: "LAST TOUCH", align: "right" },
];

/**
 * The same deals as the board, flattened. Every column header is a sort
 * toggle; the sort itself is a per-user preference, not view state, so it is
 * persisted by the caller rather than pushed into the URL.
 */
export function ListTable({
  pipeline,
  stages,
  deals,
  sort,
  onSort,
}: {
  pipeline: PipelineConfig;
  stages: StageConfig[];
  deals: Deal[];
  sort: ListSort;
  onSort: (sort: ListSort) => void;
}) {
  const router = useRouter();
  const stageOrder = stages.map((s) => s.id);
  const rows = sortDeals(deals, sort, stageOrder);
  const overdue = rows.filter((d) => d.next?.state === "overdue").length;

  return (
    <div
      className="px-4 sm:px-7"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 460,
        // The 1080px table scrolls inside this container rather than pushing
        // the page sideways.
        overflow: "auto",
        paddingTop: 18,
        paddingBottom: 28,
      }}
    >
      <div
        data-testid="list-table"
        style={{
          background: "#111411",
          border: "1px solid #1f231e",
          borderRadius: 14,
          overflow: "hidden",
          minWidth: 1080,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            alignItems: "center",
            gap: 14,
            padding: "12px 18px",
            background: "#0e110e",
            borderBottom: "1px solid #1f231e",
            fontSize: 10,
            letterSpacing: "0.9px",
            fontWeight: 700,
            color: "#6f7a6f",
          }}
        >
          {HEADS.map((h) => {
            const active = sort.key === h.id;
            const Arrow = sort.dir > 0 ? ChevronUp : ChevronDown;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onSort(nextSort(sort, h.id))}
                data-testid={`list-head-${h.id}`}
                data-sort={
                  active ? (sort.dir > 0 ? "asc" : "desc") : "none"
                }
                aria-label={`Sort by ${h.label.toLowerCase()}`}
                className="hover:!text-[#c6cdc6]"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  font: "inherit",
                  letterSpacing: "inherit",
                  cursor: "pointer",
                  color: active ? "#c6cdc6" : "#6f7a6f",
                  justifyContent: h.align === "right" ? "flex-end" : "flex-start",
                }}
              >
                {h.label}
                {active && (
                  <Arrow size={11} strokeWidth={3} aria-hidden color="#4b9c2d" />
                )}
              </button>
            );
          })}
          <span />
        </div>

        {rows.map((deal) => (
          <ListRow
            key={deal.id}
            deal={deal}
            stages={stages}
            onOpen={() => router.push(`/record/${deal.id}`)}
          />
        ))}

        <div
          data-testid="list-footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "13px 18px",
            background: "#0e110e",
            fontSize: 12,
            color: "#6f7a6f",
          }}
        >
          <span>
            {rows.length} {rows.length === 1 ? "lead" : "leads"} ·{" "}
            {pipeline.title}
          </span>
          <span style={{ color: "#7ea85c" }}>
            {overdue ? `${overdue} overdue` : "Nothing overdue"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ListRow({
  deal,
  stages,
  onOpen,
}: {
  deal: Deal;
  stages: StageConfig[];
  onOpen: () => void;
}) {
  const track = deal.track ? TRACK_STYLE[deal.track] : AUTOMATED_TRACK_STYLE;
  const overdue = deal.next?.state === "overdue";
  const stage = stages.find((s) => s.id === deal.stage);

  return (
    <div
      role="row"
      data-testid={`list-row-${deal.id}`}
      data-deal-id={deal.id}
      onClick={onOpen}
      className="hover:!bg-[#161a15]"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderBottom: "1px solid #191d18",
        cursor: "pointer",
        background: deal.aiPending ? "#0f130e" : "transparent",
      }}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          data-testid="row-accent"
          style={{
            width: 3,
            height: 30,
            borderRadius: 2,
            flex: "none",
            background: deal.aiPending
              ? "#7ed321"
              : overdue
                ? "#8c3a30"
                : "#252b23",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Link
              href={`/record/${deal.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:!text-[#b6f07a]"
              style={{
                fontSize: 14.5,
                fontWeight: 600,
                color: "#e9ede9",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {deal.name}
            </Link>
            {deal.aiPending && <AiDraftChip compact />}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "#7d877d",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {deal.account || "—"}
          </div>
        </div>
      </div>

      <div>
        <TrackChip track={track} size="row" />
      </div>

      <div
        style={{
          fontSize: 13,
          color: stage?.titleColor ?? "#c6cdc6",
        }}
      >
        {stage?.label ?? "—"}
      </div>

      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flex: "none",
            background: !deal.next ? "#5c655c" : overdue ? "#e07a68" : "#7ed321",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            data-testid="row-next"
            style={{
              fontSize: 13,
              color: !deal.next ? "#98a298" : overdue ? "#f0a294" : "#e2e7e2",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {deal.next ? deal.next.label : "Not set"}
          </div>
          <div style={{ fontSize: 11, color: "#6f7a6f", marginTop: 1 }}>
            {deal.next ? deal.next.due : "Required"}
          </div>
        </div>
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
      >
        <OwnerBadge owner={deal.owner} />
        <span
          style={{
            fontSize: 12.5,
            color: "#98a298",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {deal.owner.name}
        </span>
      </div>

      <div
        data-testid="row-stale"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          color: deal.staleWarn ? "#e07a68" : "#7d877d",
          textAlign: "right",
        }}
      >
        {deal.initialType || deal.stale || "—"}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <EllipsisVertical size={16} strokeWidth={2} aria-hidden color="#4f584f" />
      </div>
    </div>
  );
}

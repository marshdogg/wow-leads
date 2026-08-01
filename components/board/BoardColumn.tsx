"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronDown } from "lucide-react";
import { columnBorder, columnTitleColor, stageValueTotal } from "@/lib/pipelines";
import type { Deal, PipelineId, StageConfig } from "@/lib/types";
import { DraggableCard } from "./DraggableCard";

/**
 * One stage column. The chevron *and* the stage title collapse every card in
 * the stage — the whole header block behaves like one control, which is what
 * you reach for when scanning a wide board.
 *
 * The `$ in stage` roll-up is computed from the cards actually rendered, so it
 * stays honest while a card is mid-move or a track filter is on.
 */
export function BoardColumn({
  pipe,
  stage,
  cards,
  collapsed,
  onToggle,
}: {
  pipe: PipelineId;
  stage: StageConfig;
  cards: Deal[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = stageValueTotal(pipe, cards);

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${stage.id}`}
      data-over={isOver || undefined}
      aria-label={stage.label}
      style={{
        width: 306,
        flex: "none",
        minHeight: 420,
        display: "flex",
        flexDirection: "column",
        background: "#111411",
        border: `1px solid ${columnBorder(stage, isOver)}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div style={{ flex: "none", padding: "14px 16px 11px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              title={
                collapsed
                  ? "Expand cards in this stage"
                  : "Collapse cards in this stage"
              }
              data-testid={`collapse-${stage.id}`}
              className="hover:!bg-[#1e231d] hover:!text-[#c6cdc6]"
              style={{
                width: 20,
                height: 20,
                flex: "none",
                padding: 0,
                border: "none",
                background: "transparent",
                borderRadius: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6f7a6f",
                cursor: "pointer",
                transform: `rotate(${collapsed ? "-90deg" : "0deg"})`,
                transition: "transform 0.15s ease",
              }}
            >
              <ChevronDown size={12} strokeWidth={3} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="hover:!text-[#b6f07a]"
              style={{
                minWidth: 0,
                padding: 0,
                border: "none",
                background: "transparent",
                fontWeight: 600,
                fontSize: 15,
                color: columnTitleColor(stage),
                cursor: "pointer",
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stage.label}
            </button>
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.7px",
              fontWeight: 600,
              color: "#8b948b",
              background: "#1a1e19",
              border: "1px solid #23271f",
              borderRadius: 5,
              padding: "4px 7px",
              flex: "none",
            }}
          >
            {cards.length}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#6f7a6f", marginTop: 4 }}>
          {stage.hint}
        </div>
        {total && (
          <div
            style={{
              marginTop: 9,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "#b6f07a",
            }}
          >
            {total}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "2px 12px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        {isOver && (
          <div
            aria-hidden
            style={{
              flex: "none",
              border: "1px dashed #4b9c2d",
              background: "#0f1a0b",
              borderRadius: 11,
              height: 56,
            }}
          />
        )}
        {cards.map((deal) => (
          <DraggableCard key={deal.id} deal={deal} collapsed={collapsed} />
        ))}
        {cards.length === 0 && (
          <div
            style={{
              border: "1px dashed #2a2f28",
              borderRadius: 11,
              padding: "20px 14px",
              textAlign: "center",
              fontSize: 12,
              color: "#5c655c",
            }}
          >
            Nothing here
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import type { PipelineConfig, PipelineId } from "@/lib/types";

/**
 * The pipeline switcher: a vertical panel between the nav rail and the board.
 * Selecting a pipeline also resets the track filter.
 *
 * Below `md` a third column is fatal on a 390px phone, so the same markup
 * becomes a horizontal scroller above the board content — the flex direction
 * flips on the parent, which is why one DOM order serves both layouts.
 *
 * `testIdPrefix` lets the Switcher reuse this under its own test ids
 * (`switcher-comm`) without forking the component.
 */
export function PipelineSelector({
  pipelines,
  selected,
  onSelect,
  testIdPrefix = "pipeline",
}: {
  pipelines: PipelineConfig[];
  selected: PipelineId;
  onSelect: (id: PipelineId) => void;
  testIdPrefix?: string;
}) {
  return (
    <nav
      aria-label="Pipelines"
      data-testid="pipeline-panel"
      className="flex w-full shrink-0 flex-row gap-2.5 overflow-x-auto border-b px-4 py-3 md:w-[210px] md:flex-col md:gap-1.5 md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-[18px]"
      style={{ borderColor: "#1f231e" }}
    >
      <div
        className="hidden md:block"
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.9px",
          color: "#6f7a6f",
          padding: "0 4px",
          marginBottom: 8,
        }}
      >
        PIPELINES
      </div>

      {pipelines.map((p) => {
        const on = p.id === selected;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-pressed={on}
            data-testid={`${testIdPrefix}-${p.id}`}
            className="w-[196px] shrink-0 hover:!border-[#4b9c2d] md:w-full"
            style={{
              border: `1px solid ${on ? "#4b9c2d" : "#262b25"}`,
              background: on ? "#101a0b" : "#141814",
              borderRadius: 11,
              padding: "11px 12px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {/* Long labels wrap to two lines in a 210px panel, so the dot and
                chevron align to the first line rather than floating between. */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  flex: "none",
                  marginTop: 7,
                  borderRadius: "50%",
                  background: p.dot,
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: on ? "#b6f07a" : "#c6cdc6",
                }}
              >
                {p.label}
              </span>
              {on && (
                <ChevronRight
                  size={14}
                  strokeWidth={2.5}
                  aria-hidden
                  color="#b6f07a"
                  style={{ flex: "none", marginLeft: "auto" }}
                />
              )}
            </div>
            <div style={{ fontSize: 11, color: "#6f7a6f", marginTop: 4 }}>
              {p.meta}
            </div>
          </button>
        );
      })}
    </nav>
  );
}

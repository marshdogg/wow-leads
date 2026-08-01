"use client";

import type { PipelineConfig, PipelineId } from "@/lib/types";

/** Four pipeline cards. Selecting one also resets the track filter. */
export function PipelineSelector({
  pipelines,
  selected,
  onSelect,
}: {
  pipelines: PipelineConfig[];
  selected: PipelineId;
  onSelect: (id: PipelineId) => void;
}) {
  return (
    <div style={{ flex: "none", padding: "16px 28px 0" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pipelines.map((p) => {
          const on = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={on}
              data-testid={`pipeline-${p.id}`}
              className="hover:!border-[#4b9c2d]"
              style={{
                border: `1px solid ${on ? "#4b9c2d" : "#262b25"}`,
                background: on ? "#101a0b" : "#141814",
                borderRadius: 11,
                padding: "11px 16px",
                minWidth: 196,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 9 }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
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
              </div>
              <div style={{ fontSize: 11, color: "#6f7a6f", marginTop: 4 }}>
                {p.meta}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

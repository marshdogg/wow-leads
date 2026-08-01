"use client";

import type { PipelineConfig, PipelineId } from "@/lib/types";

/**
 * Pipeline cards. Selecting one also resets the track filter.
 *
 * `testIdPrefix` exists so the Switcher can reuse this selector under its own
 * test ids (`switcher-comm`) without forking the component.
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
    <div className="px-4 sm:px-7" style={{ flex: "none", paddingTop: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pipelines.map((p) => {
          const on = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={on}
              data-testid={`${testIdPrefix}-${p.id}`}
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

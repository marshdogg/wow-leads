"use client";

import { useState } from "react";
import { TEMPLATE_VARIABLES } from "@/lib/templates/resolve";
import type { TemplateFacts } from "@/lib/templates/types";
import { inputStyle } from "./Field";

/**
 * The variables a template may use, click to insert.
 *
 * `source` is shown for every one, not tucked behind a tooltip, because
 * "Absent for a lead with no job" is the single most important thing an author
 * can know *before* typing `{{job.scope}}` — it is the difference between
 * writing a narrow template on purpose and writing one that mysteriously never
 * gets picked.
 */
export function VariablePalette({
  onInsert,
  facts,
}: {
  onInsert: (token: string) => void;
  /** Facts for the previewed record, to mark which are unavailable there. */
  facts: TemplateFacts | null;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? TEMPLATE_VARIABLES.filter(
        (v) =>
          v.token.toLowerCase().includes(q) ||
          v.label.toLowerCase().includes(q),
      )
    : TEMPLATE_VARIABLES;

  return (
    <div data-testid="variable-palette">
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.7px",
          color: "#6f7a6f",
          fontWeight: 600,
        }}
      >
        VARIABLES · {TEMPLATE_VARIABLES.length}
      </div>

      {/* The registry has outgrown a scannable list, so it filters and scrolls
          in place rather than running the page a screen and a half longer than
          the editor it belongs to. */}
      <input
        data-testid="variable-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter variables"
        aria-label="Filter variables"
        style={{ ...inputStyle, marginTop: 10 }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginTop: 10,
          maxHeight: 520,
          overflowY: "auto",
        }}
      >
        {shown.map((v) => {
          const value = facts ? facts[v.token] : null;
          const available =
            !facts || (typeof value === "string" && value.trim().length > 0);
          return (
            <button
              key={v.token}
              type="button"
              data-testid={`variable-${v.token}`}
              onClick={() => onInsert(v.token)}
              className="hover:!border-[#4b9c2d]"
              style={{
                textAlign: "left",
                border: "1px solid #262b25",
                background: "#141814",
                borderRadius: 9,
                padding: "9px 11px",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "#e9ede9",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <code
                  style={{
                    fontFamily:
                      "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: available ? "#b6f07a" : "#7d877d",
                  }}
                >
                  {`{{${v.token}}}`}
                </code>
                <span style={{ fontSize: 11, color: "#8b948b" }}>{v.label}</span>
                {!available ? (
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.7px",
                      fontWeight: 600,
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: "#2b2413",
                      color: "#d8b45e",
                    }}
                  >
                    NOT ON THIS RECORD
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#6f7a6f",
                  marginTop: 4,
                  lineHeight: 1.45,
                }}
              >
                {v.source} Renders as &ldquo;{value?.trim() || v.example}
                &rdquo;.
              </div>
            </button>
          );
        })}
        {!shown.length ? (
          <div style={{ fontSize: 12, color: "#6f7a6f", padding: "6px 2px" }}>
            No variable matches &ldquo;{query}&rdquo;.
          </div>
        ) : null}
      </div>
    </div>
  );
}

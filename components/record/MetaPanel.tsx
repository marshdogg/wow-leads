import { RECORD_FIELDS } from "@/lib/record-fields";
import { Panel, SectionLabel } from "./Panel";
import type { MetaRow } from "./view-model";

/** The RECORD panel — source, provenance, owner, pipeline, business type,
 *  preferred channel. Row colours are decided in `metaRows()`. */
export function MetaPanel({ rows }: { rows: MetaRow[] }) {
  return (
    <Panel>
      <SectionLabel>{RECORD_FIELDS.recordHeading}</SectionLabel>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 13,
          marginTop: 14,
        }}
      >
        {rows.map((m) => (
          <div
            key={m.key}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "#6f7a6f" }}>{m.label}</div>
            <div style={{ fontSize: 13, color: m.color, textAlign: "right" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

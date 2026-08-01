import { DashHeading, DashPanel } from "./DashPanel";
import { winColor, type HealthRow } from "./rows";

const GRID = "1.4fr 1fr 0.8fr 0.9fr";
const HEADS = ["REP", "ACTIVE", "WIN %", "AVG SIZE"];

/** Active value, win rate and average deal size, with the Team row last. */
export function PipelineHealth({ rows }: { rows: HealthRow[] }) {
  return (
    <DashPanel>
      <DashHeading
        title="Pipeline health"
        sub="Active value, win rate and deal size per rep."
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          fontSize: 11,
          letterSpacing: "0.6px",
          color: "#6f7a6f",
          fontWeight: 600,
          paddingBottom: 9,
          marginTop: 14,
          borderBottom: "1px solid #1f231e",
        }}
      >
        {HEADS.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>

      {rows.map((h) => (
        <div
          key={h.name}
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            alignItems: "center",
            fontSize: 13,
            padding: "11px 0",
            borderBottom: "1px solid #171a16",
          }}
        >
          <div>{h.name}</div>
          <div
            style={{
              fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
              color: "#e2e7e2",
            }}
          >
            {h.active}
          </div>
          <div style={{ color: winColor(h), fontWeight: 600 }}>{h.win}</div>
          <div
            style={{
              fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
              color: "#c6cdc6",
            }}
          >
            {h.size}
          </div>
        </div>
      ))}
    </DashPanel>
  );
}

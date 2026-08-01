import { DashHeading, DashPanel } from "./DashPanel";
import type { Stat } from "./rows";

/** Three prospecting stats — coverage, cadence, and what has gone quiet. */
export function ProspectMetrics({ stats }: { stats: Stat[] }) {
  return (
    <DashPanel>
      <DashHeading title="Prospecting metrics" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginTop: 14,
        }}
      >
        {stats.map((m) => (
          <div key={m.label}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, color: "#c6cdc6" }}>{m.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: m.color }}>
                {m.value}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6f7a6f", marginTop: 2 }}>
              {m.note}
            </div>
          </div>
        ))}
      </div>
    </DashPanel>
  );
}

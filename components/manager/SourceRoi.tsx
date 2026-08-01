import { DashHeading } from "./DashPanel";
import { roiColor, roiPct, type SourceRoiRow } from "./rows";

/**
 * Revenue attributed to the source captured at first contact — which is why
 * source is the one required field when a lead is created.
 */
export function SourceRoi({ rows }: { rows: SourceRoiRow[] }) {
  return (
    <>
      <DashHeading
        title="Source → revenue ROI"
        sub="Attributed to the source captured at first contact."
        marginTop={22}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 11,
          marginTop: 14,
        }}
      >
        {rows.map((s) => {
          const pct = roiPct(s);
          return (
            <div
              key={s.label}
              style={{ display: "flex", alignItems: "center", gap: 12 }}
            >
              <div
                style={{
                  width: 132,
                  flex: "none",
                  fontSize: 12,
                  color: "#98a298",
                }}
              >
                {s.label}
              </div>
              <div
                role="meter"
                aria-label={`${s.label} — ${pct}% of top source, ${s.value} attributed`}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  flex: 1,
                  height: 9,
                  borderRadius: 5,
                  background: "#171b16",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: roiColor(s),
                  }}
                />
              </div>
              <div
                style={{
                  width: 66,
                  textAlign: "right",
                  fontFamily:
                    "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                  fontSize: 12,
                  color: "#c6cdc6",
                }}
              >
                {s.value}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

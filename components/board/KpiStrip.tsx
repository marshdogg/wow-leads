export interface BoardStat {
  label: string;
  value: string;
  color: string;
  note: string;
}

/**
 * Three stat cards above the columns. Content is per-pipeline, from analytics.
 *
 * The prototype draws a checkbox and an ⓘ beside each label; those belong to
 * its annotation-editor overlay, not to the product, so a card is just
 * label → value → note.
 */
export function KpiStrip({ stats }: { stats: BoardStat[] }) {
  return (
    <div
      data-testid="kpi-strip"
      style={{
        flex: "none",
        padding: "16px 28px 0",
        display: "flex",
        gap: 14,
        flexWrap: "nowrap",
        overflowX: "auto",
      }}
    >
      {stats.map((k) => (
        <div
          key={k.label}
          style={{
            flex: 1,
            minWidth: 238,
            background: "#141814",
            border: "1px solid #23271f",
            borderRadius: 12,
            padding: "14px 17px",
          }}
        >
          <div style={{ color: "#98a298", fontSize: 13 }}>{k.label}</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.8px",
              marginTop: 5,
              color: k.color,
            }}
          >
            {k.value}
          </div>
          <div style={{ fontSize: 12, color: "#6f7a6f" }}>{k.note}</div>
        </div>
      ))}
    </div>
  );
}

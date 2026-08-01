export interface BoardStat {
  label: string;
  value: string;
  color: string;
  note: string;
}

/** Three stat cards above the columns. Content is per-pipeline, from analytics. */
export function KpiStrip({ stats }: { stats: BoardStat[] }) {
  return (
    <div
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#98a298",
              fontSize: 13,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 13,
                height: 13,
                flex: "none",
                borderRadius: 3,
                border: "1.5px solid #6f7a6f",
              }}
            />
            {k.label}
            <span
              aria-hidden
              style={{
                width: 13,
                height: 13,
                flex: "none",
                borderRadius: "50%",
                border: "1px solid #3b423a",
                color: "#6f7a6f",
                fontSize: 9,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              i
            </span>
          </div>
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

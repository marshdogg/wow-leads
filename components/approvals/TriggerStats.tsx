import type { Stat } from "@/lib/repositories/analytics";

/**
 * The three trigger stat cards. Same shape as the board's KPI strip —
 * `#141814` on `#23271f`, 12px radius, 238px min-width — because they answer
 * the same kind of question and should not look like a different product.
 */
export function TriggerStats({ stats }: { stats: Stat[] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        marginTop: 18,
        flexWrap: "nowrap",
        overflowX: "auto",
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            flex: 1,
            minWidth: 238,
            background: "#141814",
            border: "1px solid #23271f",
            borderRadius: 12,
            padding: "15px 17px",
          }}
        >
          <div style={{ fontSize: 13, color: "#98a298" }}>{stat.label}</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.8px",
              marginTop: 5,
              color: stat.color,
            }}
          >
            {stat.value}
          </div>
          <div style={{ fontSize: 12, color: "#6f7a6f" }}>{stat.note}</div>
        </div>
      ))}
    </div>
  );
}

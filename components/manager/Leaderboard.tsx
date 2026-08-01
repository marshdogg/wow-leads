import { ActorChip } from "@/components/record/ActorChip";
import { DashHeading } from "./DashPanel";
import { callsColor, type LeaderboardRow } from "./rows";

const GRID = "1.5fr 0.7fr 0.8fr 0.9fr 0.9fr";
const HEADS = ["REP", "CALLS", "VISITS", "PROPOSALS", "NEW CONTACTS"];

/**
 * Effort, this week — inputs a rep controls, not outcomes they don't.
 *
 * The two agents appear as rows here on purpose. They draft contacts but
 * place no calls and make no visits, so those cells read "—": the board shows
 * honestly how much of the week's outreach a person did and how much the
 * automation did, side by side and on the same scale.
 */
export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <>
      <DashHeading
        title="Activity leaderboard"
        sub="Effort, this week. Inputs a rep controls — not outcomes they don't."
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
          marginTop: 16,
          borderBottom: "1px solid #1f231e",
        }}
      >
        {HEADS.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>

      {rows.map((r) => (
        <div
          key={`${r.name}-${r.initials}`}
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            alignItems: "center",
            fontSize: 13,
            padding: "11px 0",
            borderBottom: "1px solid #171a16",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <ActorChip agent={r.isAgent} initials={r.initials} size={22} />
            <span>{r.name}</span>
          </div>
          <div style={{ color: callsColor(r, rows) }}>{r.calls}</div>
          <div style={{ color: "#c6cdc6" }}>{r.visits}</div>
          <div style={{ color: "#c6cdc6" }}>{r.proposals}</div>
          <div style={{ color: "#c6cdc6" }}>{r.contacts}</div>
        </div>
      ))}
    </>
  );
}

import Link from "next/link";
import { neglectRuleCopy } from "./neglect";
import { NudgeButton } from "./NudgeButton";
import { neglectedTotal, type NeglectedRow } from "./rows";

const GRID = "1.5fr 1fr 0.9fr 0.9fr 0.8fr 120px";

/**
 * What is being dropped. This panel is first on the page and painted in the
 * overdue red because it is the only part of the dashboard that asks the
 * manager to do something today — the rest is reporting.
 */
export function NeglectedPanel({
  rows,
  total,
}: {
  rows: NeglectedRow[];
  /** Roll-up from the analytics repository; derived from the rows if absent. */
  total?: string;
}) {
  return (
    <div
      style={{
        marginTop: 18,
        border: "1px solid #5c2620",
        background: "#180d0c",
        borderRadius: 13,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "15px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          borderBottom: "1px solid #2a1512",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            flex: "none",
            borderRadius: "50%",
            background: "#e07a68",
            animation: "wowPulse 2s ease-in-out infinite",
          }}
        />
        <div style={{ fontSize: 16, fontWeight: 600, color: "#f0a294" }}>
          Neglected deals · <span data-testid="neglected-count">{rows.length}</span>
        </div>
        <div style={{ fontSize: 13, color: "#c08a80" }}>
          {neglectRuleCopy()} {total ?? neglectedTotal(rows)} of pipeline
          sitting untouched.
        </div>
      </div>

      {rows.map((n) => (
        <div
          key={n.id}
          data-testid={`neglected-row-${n.id}`}
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            alignItems: "center",
            gap: 12,
            padding: "13px 18px",
            borderBottom: "1px solid #211110",
            fontSize: 13,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Link
              href={`/record/${n.id}`}
              className="hover:!text-[#f0a294]"
              style={{ fontWeight: 600, fontSize: 14, color: "#e9ede9" }}
            >
              {n.name}
            </Link>
            <div style={{ fontSize: 11, color: "#8b948b", marginTop: 2 }}>
              {n.account}
            </div>
          </div>
          <div style={{ color: "#c6cdc6" }}>{n.pipeline}</div>
          <div style={{ color: "#98a298" }}>{n.stage}</div>
          <div
            style={{
              fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
              color: "#e2e7e2",
            }}
          >
            {n.value}
          </div>
          <div style={{ fontWeight: 600, color: "#f0a294" }}>
            {n.days}d silent
          </div>
          <NudgeButton dealId={n.id} dealName={n.name} />
        </div>
      ))}

      {rows.length === 0 ? (
        <div
          style={{
            padding: 22,
            textAlign: "center",
            fontSize: 13,
            color: "#7ea85c",
          }}
        >
          Nothing neglected. Every active deal has either been contacted inside
          its pipeline&rsquo;s window or has a next step booked.
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { NudgeButton } from "./NudgeButton";
import {
  revisitStatus,
  undatedCount,
  type RevisitDueRow,
} from "./rows";

/**
 * Paused deals that have come due.
 *
 * Sits directly under the neglected list and is deliberately *not* part of it.
 * The two look similar and mean opposite things: a neglected deal is being
 * dropped, a paused deal is sitting exactly where somebody put it and has now
 * reached the date they chose. Merging them is what produced the false
 * positive this whole reconciliation exists to remove — a Commercial bid on
 * hold with a revisit six months out, flagged as neglected every day in
 * between — and merging them again in a shared red panel would recreate it in
 * a new costume.
 *
 * So it carries the amber of the `paused` semantic rather than the overdue
 * red, and says in its own header what makes a row appear. Same tokens, no new
 * ramp.
 */
export function RevisitDuePanel({ rows }: { rows: RevisitDueRow[] }) {
  const undated = undatedCount(rows);

  return (
    <div
      data-testid="revisit-due-panel"
      style={{
        marginTop: 18,
        border: "1px solid #4a3a17",
        background: "#141105",
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
          borderBottom: "1px solid #2b2413",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            flex: "none",
            borderRadius: "50%",
            background: "#d8b45e",
          }}
        />
        <div style={{ fontSize: 16, fontWeight: 600, color: "#e0c684" }}>
          Revisit due ·{" "}
          <span data-testid="revisit-due-count">{rows.length}</span>
        </div>
        <div style={{ fontSize: 13, color: "#b09a67" }}>
          Paused deals whose revisit date has arrived. Not neglected — parked on
          purpose, and now due.
          {undated > 0 ? (
            <>
              {" "}
              <span data-testid="revisit-undated-note" style={{ color: "#e0c684" }}>
                {undated} {undated === 1 ? "has" : "have"} no revisit date at
                all.
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Same six-track grid as the neglected list, and the same md: collapse
          for the reason given there — at 322px the tracks collide. */}
      {rows.map((r) => {
        const status = revisitStatus(r);
        return (
          <div
            key={r.id}
            data-testid={`revisit-row-${r.id}`}
            data-tone={status.tone}
            className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.9fr_0.9fr_0.8fr_120px]"
            style={{
              alignItems: "center",
              gap: 12,
              padding: "13px 18px",
              borderBottom: "1px solid #241d0f",
              fontSize: 13,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Link
                href={`/record/${r.id}`}
                className="hover:!text-[#e0c684]"
                style={{ fontWeight: 600, fontSize: 14, color: "#e9ede9" }}
              >
                {r.name}
              </Link>
              <div style={{ fontSize: 11, color: "#8b948b", marginTop: 2 }}>
                {r.account}
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 md:contents">
              <div style={{ color: "#c6cdc6" }}>{r.pipeline}</div>
              <div style={{ color: "#98a298" }}>{r.stage}</div>
              <div
                style={{
                  fontFamily:
                    "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                  color: "#e2e7e2",
                }}
              >
                {r.value}
              </div>
              <div data-testid={`revisit-status-${r.id}`} style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    // The undated row is the one worth chasing, so it is the
                    // one that reads as a problem rather than a date arriving.
                    color: status.tone === "undated" ? "#f0a294" : "#e0c684",
                  }}
                >
                  {status.label}
                </div>
                {/* The silence, when it says more than the primary number —
                    twelve days past a revisit is a diary item, the same
                    partner at 152 days silent is the actual story. */}
                {status.note ? (
                  <div
                    data-testid={`revisit-note-${r.id}`}
                    style={{ fontSize: 11, color: "#8b948b", marginTop: 2 }}
                  >
                    {status.note}
                  </div>
                ) : null}
              </div>
            </div>

            <NudgeButton dealId={r.id} dealName={r.name} />
          </div>
        );
      })}

      {rows.length === 0 ? (
        <div
          style={{
            padding: 22,
            textAlign: "center",
            fontSize: 13,
            color: "#7ea85c",
          }}
        >
          Nothing paused has come due. Every parked deal has a revisit date
          still ahead of it.
        </div>
      ) : null}
    </div>
  );
}

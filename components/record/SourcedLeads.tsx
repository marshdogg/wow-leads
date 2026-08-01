import Link from "next/link";
import { hasValue } from "@/components/manager/rows";
import { TRACK_STYLE } from "@/lib/pipelines";
import { RECORD_FIELDS } from "@/lib/record-fields";
import type { TrackId } from "@/lib/types";
import { Panel, SectionLabel } from "./Panel";

/**
 * Structural mirror of `SourcedLead` from `lib/repositories/deals.ts`.
 */
export interface SourcedLead {
  id: string;
  name: string;
  account: string;
  stage: string;
  value: string;
  track: string | null;
}

/**
 * The leads a completed job produced — the neighbour who asked about their
 * trim while the crew was next door.
 *
 * It sits under the activity timeline rather than up with the property
 * details because it is a *consequence* of the job, not a fact about the
 * account: this record caused those records. The count and value are the
 * argument for canvassing a street you are already working on.
 */
export function SourcedLeads({
  leads,
  totalValue,
}: {
  leads: SourcedLead[];
  /**
   * From `getSourcedLeadSummary()`, which sums the leads' raw metrics. Summing
   * the formatted `value` strings here would compound the rounding each one
   * already lost — "$5.2K" is not "$5,200".
   */
  totalValue: string;
}) {
  if (!leads.length) return null;

  return (
    <Panel testId="sourced-leads">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <SectionLabel>{RECORD_FIELDS.leadsFromJobHeading}</SectionLabel>
        <div style={{ fontSize: 12, color: "#6f7a6f" }}>
          {leads.length} {leads.length === 1 ? "lead" : "leads"}
          {/*
            A zero total means nothing here has been estimated yet, not that
            the job produced worthless work — a lead sitting in New has no
            EST. VALUE by definition. Printing "$0" would assert the first and
            undersell the very thing this panel exists to demonstrate, so the
            value appears only once there is one.
          */}
          {hasValue(totalValue) ? (
            <>
              {" · "}
              <span
                style={{
                  fontFamily:
                    "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                  color: "#b6f07a",
                }}
              >
                {totalValue}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 13,
        }}
      >
        {leads.map((l) => {
          const track = l.track
            ? TRACK_STYLE[l.track as TrackId]
            : undefined;
          return (
            <Link
              key={l.id}
              href={`/record/${l.id}`}
              data-testid="sourced-lead-row"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:!border-[#4b9c2d]"
              style={{
                border: "1px solid #262b25",
                background: "#141814",
                borderRadius: 10,
                padding: "11px 13px",
                color: "#e9ede9",
              }}
            >
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{l.name}</div>
                <div
                  style={{ fontSize: 11, color: "#8b948b", marginTop: 2 }}
                >
                  {l.account}
                </div>
              </div>

              {track ? (
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.8px",
                    fontWeight: 600,
                    padding: "4px 7px",
                    borderRadius: 4,
                    background: track.bg,
                    color: track.color,
                    border: `1px solid ${track.border}`,
                  }}
                >
                  {track.label}
                </span>
              ) : null}

              <span style={{ fontSize: 12, color: "#98a298" }}>{l.stage}</span>
              <span
                style={{
                  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                  fontSize: 12,
                  color: "#e2e7e2",
                }}
              >
                {l.value}
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

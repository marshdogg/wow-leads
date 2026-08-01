import Link from "next/link";
import { DashHeading, DashPanel } from "./DashPanel";
import { hasValue } from "./rows";

/**
 * Structural mirror of `getJobSiteAttribution()`'s return from
 * `lib/repositories/deals.ts`.
 */
export interface JobSiteAttributionData {
  jobs: number;
  leads: number;
  value: string;
  topJob: {
    id: string;
    /** The job's address — the headline, since a job is a place. */
    account: string;
    /** The homeowner, shown as the secondary line. */
    name: string;
    leads: number;
    value: string;
  } | null;
}

/**
 * What the work already on the ground produced.
 *
 * This is the number that decides whether a crew knocks on four doors before
 * they pack up, so it gets the headline treatment rather than a line in the
 * stat list: jobs that produced leads, leads produced, and what they are
 * worth — plus the single best example, because "this job made $14K of
 * neighbours" is the argument, not the average.
 */
export function JobSiteAttribution({
  data,
}: {
  data: JobSiteAttributionData;
}) {
  const { jobs, leads, value, topJob } = data;

  return (
    <DashPanel testId="job-site-attribution">
      <DashHeading
        title="Job-site attribution"
        sub="Leads produced by work already on the ground — canvassing where the truck already is."
      />

      <div
        className="grid grid-cols-3 gap-3"
        style={{ marginTop: 16 }}
      >
        <Figure label="SOURCE JOBS" value={String(jobs)} color="#e9ede9" />
        <Figure label="LEADS PRODUCED" value={String(leads)} color="#7ed321" />
        {/* "—", not "$0", while nothing has been estimated yet: the counts
            beside it are real, and a hard zero here reads as "canvassing
            earned nothing" rather than "not priced yet". */}
        <Figure
          label="ATTRIBUTED"
          value={hasValue(value) ? value : "—"}
          color={hasValue(value) ? "#7ed321" : "#6f7a6f"}
          mono
        />
      </div>

      {topJob ? (
        // The whole block is the link, not just the address — it reads as one
        // clickable unit and gives the pointer a target worth hitting.
        <Link
          href={`/record/${topJob.id}`}
          data-testid="attribution-top-job"
          className="block hover:!border-[#4b9c2d] hover:!bg-[#16290e]"
          style={{
            marginTop: 16,
            border: "1px solid #2f6b1f",
            background: "#0f1a0b",
            borderRadius: 10,
            padding: "13px 15px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              fontWeight: 600,
              color: "#7ea85c",
            }}
          >
            BEST PERFORMING JOB
          </div>
          {/* Address leads, homeowner follows — a job is a place, and the
              record identifies the same job the same way. */}
          <div
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
            style={{ marginTop: 5 }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: "#b6f07a" }}>
              {topJob.account}
            </span>
            <span style={{ fontSize: 12, color: "#8b948b" }}>
              {topJob.name} · {topJob.leads}{" "}
              {topJob.leads === 1 ? "lead" : "leads"}
              {hasValue(topJob.value) ? (
                <>
                  {" · "}
                  <span
                    style={{
                      fontFamily:
                        "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                    }}
                  >
                    {topJob.value}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </Link>
      ) : null}
    </DashPanel>
  );
}

function Figure({
  label,
  value,
  color,
  mono = false,
}: {
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.7px",
          color: "#6f7a6f",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color,
          marginTop: 4,
          letterSpacing: "-0.4px",
          fontFamily: mono
            ? "var(--font-plex-mono), 'IBM Plex Mono', monospace"
            : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

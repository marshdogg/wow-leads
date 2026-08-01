import { RECORD_FIELDS } from "@/lib/record-fields";
import type { Touchpoint } from "@/lib/types";
import { ActorChip } from "./ActorChip";
import { Panel, SectionLabel } from "./Panel";
import { formatWhen } from "./view-model";

/**
 * Every touchpoint on the deal, newest first, each showing who or what made
 * it. An agent-sent SMS and a rep's site note sit in the same column, and the
 * only thing separating them is the chip in the gutter — square for an agent,
 * round for a person. That is the screen's whole argument: automation is
 * visible in the history, not hidden behind it.
 */
export function ActivityTimeline({ timeline }: { timeline: Touchpoint[] }) {
  return (
    <Panel>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <SectionLabel>{RECORD_FIELDS.activityHeading}</SectionLabel>
        <div style={{ fontSize: 12, color: "#6f7a6f" }}>
          {timeline.length} {timeline.length === 1 ? "entry" : "entries"} ·{" "}
          {RECORD_FIELDS.activityCountSuffix}
        </div>
      </div>

      <div
        data-testid="timeline"
        style={{ display: "flex", flexDirection: "column", marginTop: 16 }}
      >
        {timeline.map((t, i) => (
          <div
            key={t.id}
            data-testid={t.byAgent ? "timeline-agent" : "timeline-human"}
            style={{ display: "flex", gap: 14 }}
          >
            <div
              style={{
                flex: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 26,
              }}
            >
              <ActorChip agent={t.byAgent} initials={t.initials} size={24} />
              {i < timeline.length - 1 ? (
                <div
                  style={{
                    width: 1,
                    flex: 1,
                    background: "#23271f",
                    marginTop: 6,
                  }}
                />
              ) : null}
            </div>

            <div
              style={{
                flex: 1,
                paddingBottom: i < timeline.length - 1 ? 18 : 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 9,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.7px",
                    fontWeight: 600,
                    padding: "3px 6px",
                    borderRadius: 4,
                    background: "#1a1e19",
                    color: "#98a298",
                  }}
                >
                  {t.channel}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: "#e2e7e2",
                    lineHeight: 1.45,
                  }}
                >
                  {t.body}
                </span>
              </div>
              <div
                style={{ fontSize: 12, color: "#6f7a6f", marginTop: 4 }}
              >
                {t.who} · {formatWhen(new Date(t.occurredAt))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

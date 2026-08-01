import { propertyLabel, RECORD_FIELDS } from "@/lib/record-fields";
import type { AccountDetail } from "@/lib/types";
import { Panel, SectionLabel } from "./Panel";

/**
 * Amber caution block for access notes.
 *
 * NOTE — the v3 prototype paints this block `#1a1608` / `#c8a44e` / `#e6d9b4`,
 * which is a deeper amber than the `#2b2413` / `#d8b45e` revival-chip tokens.
 * Prototype values win here because the block is a full-width panel, not a
 * chip, and the darker ground is what carries the caution weight. Swap these
 * three values if the design system rules otherwise.
 */
const ACCESS_NOTE_STYLE = {
  border: "#4a3a17",
  background: "#1a1608",
  label: "#c8a44e",
  body: "#e6d9b4",
} as const;

/**
 * Property / site details plus access notes.
 *
 * Access notes are gate codes, dogs and parking — the operational detail a
 * crew needs before it arrives. It gets a caution block rather than another
 * label/value pair because missing it costs a wasted truck roll.
 */
export function PropertyPanel({
  details,
  accessNotes,
}: {
  details: AccountDetail[];
  accessNotes: string;
}) {
  return (
    <Panel>
      <SectionLabel>{RECORD_FIELDS.propertyHeading}</SectionLabel>

      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: 15, marginTop: 14 }}
      >
        {details.map((d) => (
          <div key={d.label}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.7px",
                color: "#6f7a6f",
                fontWeight: 600,
              }}
            >
              {propertyLabel(d.label)}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#e2e7e2",
                marginTop: 4,
                lineHeight: 1.45,
              }}
            >
              {d.value}
            </div>
          </div>
        ))}
      </div>

      <div
        data-testid="access-notes"
        style={{
          marginTop: 15,
          border: `1px solid ${ACCESS_NOTE_STYLE.border}`,
          background: ACCESS_NOTE_STYLE.background,
          borderRadius: 10,
          padding: "13px 15px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.8px",
            color: ACCESS_NOTE_STYLE.label,
            fontWeight: 600,
          }}
        >
          {RECORD_FIELDS.accessHeading}
        </div>
        <div
          style={{
            fontSize: 13,
            color: ACCESS_NOTE_STYLE.body,
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {accessNotes}
        </div>
      </div>
    </Panel>
  );
}

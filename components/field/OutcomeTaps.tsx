"use client";

import { MapPin, MessageSquare, Phone } from "lucide-react";

export type OutcomeKind = "Call" | "Text" | "Visit";

const TAPS: { kind: OutcomeKind; Icon: typeof Phone }[] = [
  { kind: "Call", Icon: Phone },
  { kind: "Text", Icon: MessageSquare },
  { kind: "Visit", Icon: MapPin },
];

/**
 * Three one-tap outcomes. No fields, no modal, no confirm — a tap writes the
 * touchpoint, sets a default next step and toasts. That three-second path from
 * a driveway is the adoption bar for the whole module.
 */
export function OutcomeTaps({
  pending,
  onTap,
}: {
  pending: OutcomeKind | null;
  onTap: (kind: OutcomeKind) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {TAPS.map(({ kind, Icon }) => {
        const busy = pending === kind;
        return (
          <button
            key={kind}
            type="button"
            data-testid={`one-tap-${kind.toLowerCase()}`}
            disabled={pending !== null}
            onClick={() => onTap(kind)}
            className="wf-tap hover:!border-[#4b9c2d]"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              border: `1px solid ${busy ? "#4b9c2d" : "#262b25"}`,
              background: busy ? "#0f1a0b" : "#141814",
              borderRadius: 12,
              cursor: pending ? "default" : "pointer",
              opacity: pending && !busy ? 0.5 : 1,
              padding: "8px 4px",
              font: "inherit",
            }}
          >
            <Icon
              size={17}
              strokeWidth={2}
              color={busy ? "#b6f07a" : "#98a298"}
            />
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: busy ? "#b6f07a" : "#98a298",
              }}
            >
              {kind}
            </div>
          </button>
        );
      })}
    </div>
  );
}

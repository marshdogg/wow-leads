import type { TrackStyle } from "@/lib/types";

/** The track (or AUTOMATED) chip. `size` matches the board card vs. list row. */
export function TrackChip({
  track,
  size = "card",
}: {
  track: TrackStyle;
  size?: "card" | "row";
}) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: size === "card" ? "0.9px" : "0.9px",
        fontWeight: 700,
        padding: size === "card" ? "3px 7px" : "4px 8px",
        borderRadius: 4,
        background: track.bg,
        color: track.color,
        border: `1px solid ${track.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {track.label}
    </span>
  );
}

/** Pulsing AI chip. `AI DRAFTED` on the card, a bare `AI` beside a list name. */
export function AiDraftChip({ label = "AI DRAFTED" }: { label?: string }) {
  const compact = label === "AI";
  return (
    <span
      style={{
        fontSize: compact ? 8 : 9,
        letterSpacing: "0.8px",
        fontWeight: 700,
        padding: compact ? "3px 6px" : "3px 7px",
        borderRadius: 4,
        background: "#0f1a0b",
        color: "#a8ea6b",
        border: "1px solid #2f6b1f",
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: compact ? 4 : 5,
          height: compact ? 4 : 5,
          borderRadius: "50%",
          background: "#7ed321",
          animation: "wowPulse 1.6s ease-in-out infinite",
        }}
      />
      {label}
    </span>
  );
}

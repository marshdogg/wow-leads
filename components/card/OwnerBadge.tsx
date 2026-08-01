import type { DealOwner } from "@/lib/types";

/**
 * 22px owner badge. An agent owner is a *square* AI chip; a person is a round
 * initials avatar. Shared by the board card and the list row so the two can
 * never drift.
 */
export function OwnerBadge({ owner }: { owner: DealOwner }) {
  if (owner.agent) {
    return (
      <div
        aria-hidden
        style={{
          width: 22,
          height: 22,
          flex: "none",
          borderRadius: 6,
          border: "1px solid #2f6b1f",
          background: "#0f1a0b",
          color: "#a8ea6b",
          fontSize: 8,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        AI
      </div>
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: 22,
        height: 22,
        flex: "none",
        borderRadius: "50%",
        background: "#22301b",
        color: "#a8ea6b",
        fontSize: 9,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {owner.initials}
    </div>
  );
}

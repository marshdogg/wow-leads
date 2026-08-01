/**
 * Who — or what — performed something.
 *
 * A square chip reading "AI" means an agent did it; a round avatar with
 * initials means a person did. That distinction is the point of the record's
 * provenance timeline and of the leaderboard's agent rows, so the two shapes
 * are deliberately different at a glance, not just differently coloured.
 */
export function ActorChip({
  agent,
  initials,
  size = 24,
}: {
  agent: boolean;
  initials: string;
  /** 24 on the record timeline, 22 in the manager leaderboard. */
  size?: number;
}) {
  const base = {
    width: size,
    height: size,
    flex: "none" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    color: "#a8ea6b",
  };

  if (agent) {
    return (
      <div
        aria-label="Logged by an AI agent"
        style={{
          ...base,
          borderRadius: 6,
          border: "1px solid #2f6b1f",
          background: "#0f1a0b",
          fontSize: size >= 24 ? 9 : 8,
          fontWeight: 700,
        }}
      >
        AI
      </div>
    );
  }

  return (
    <div
      aria-label={`Logged by ${initials}`}
      style={{
        ...base,
        borderRadius: "50%",
        background: "#22301b",
        fontSize: 9,
        fontWeight: 600,
      }}
    >
      {initials}
    </div>
  );
}

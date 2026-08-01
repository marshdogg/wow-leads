/** Where this screen is heading once agents own most first touches. */
export function FutureStateNote() {
  return (
    <div
      style={{
        border: "1px dashed #2a2f28",
        borderRadius: 13,
        padding: 18,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: "1px",
          color: "#6f7a6f",
        }}
      >
        FUTURE STATE · PRD §3
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#8b948b",
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
        As agents take over touchpoints this becomes the primary human surface.
        The agent already appears as a row on the leaderboard; when it owns most
        first touches, the manager&rsquo;s job is the neglected-deals panel and
        the approvals queue — everything else runs.
      </div>
    </div>
  );
}

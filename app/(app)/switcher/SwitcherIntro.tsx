/**
 * A one-line frame for the Switcher, so the screen reads as an argument rather
 * than as a duplicate of the board. Everything below it is the real board.
 */
export function SwitcherIntro() {
  return (
    <div
      style={{
        flex: "none",
        padding: "18px 28px 0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.9px",
          fontWeight: 700,
          color: "#7ea85c",
        }}
      >
        ONE BOARD, EVERY PIPELINE
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#7d877d",
          marginTop: 5,
          maxWidth: 720,
          lineHeight: 1.5,
        }}
      >
        The same component renders all three. Stages, column roll-ups, card
        metrics and the KPI strip are configuration, not code — switch pipelines
        and nothing from the last one comes with it.
      </p>
    </div>
  );
}

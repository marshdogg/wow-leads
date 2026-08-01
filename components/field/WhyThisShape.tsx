/**
 * The annotation column beside the phone. Static design rationale — it explains
 * why the field surface is shaped the way it is, and what already logs itself.
 */

const FIELD_NOTES = [
  {
    title: "One tap, zero required fields",
    body: "Call, Text and Visit log instantly and set a default next step. A rep can log from a driveway in three seconds — that is the adoption bar.",
  },
  {
    title: "Voice is a first-class input",
    body: "The SC talks after a walkthrough; the agent turns it into outcome, next step, scope notes and constraints. Human edits before saving.",
  },
  {
    title: "Provenance survives",
    body: 'The saved entry reads "Marshall Behrns · structured by agent" — you always know which part was a person.',
  },
  {
    title: "Same record, not a mobile app",
    body: "This is the same deal object as the board. Nothing needs syncing back.",
  },
];

const AUTO_LOGGED = [
  "Sent emails from the linked inbox",
  "Calendar site visits and bid walk-throughs",
  "Calls placed through the WOW OS dialer",
  "Inbound SMS replies",
];

export function WhyThisShape() {
  return (
    <>
      <div
        style={{
          background: "#111411",
          border: "1px solid #23271f",
          borderRadius: 13,
          padding: 20,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 16 }}>Why this shape</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 14,
          }}
        >
          {FIELD_NOTES.map((n) => (
            <div key={n.title}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#b6f07a" }}>
                {n.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#8b948b",
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                {n.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#0f120f",
          border: "1px solid #23271f",
          borderRadius: 13,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#6f7a6f",
            fontWeight: 600,
          }}
        >
          AUTO-LOGGED · NO TAPS AT ALL
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 12,
          }}
        >
          {AUTO_LOGGED.map((a) => (
            <div
              key={a}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                fontSize: 13,
                color: "#c6cdc6",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#7ed321",
                  flex: "none",
                }}
              />
              {a}
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#6f7a6f",
            marginTop: 13,
            lineHeight: 1.5,
          }}
        >
          North star: calls, SMS and email flow through the CRM, and logging
          disappears entirely.
        </div>
      </div>
    </>
  );
}

import type { ReactNode } from "react";

/** The dashboard's standard surface: `#111411` on `#23271f`, 13px radius. */
export function DashPanel({
  children,
  testId,
}: {
  children: ReactNode;
  /** Set only for panels the e2e suite addresses directly. */
  testId?: string;
}) {
  // `min-w-0`: a grid item defaults to `min-width: auto`, which lets it grow
  // past its track rather than letting an inner `overflow-x` container scroll.
  return (
    <div
      className="min-w-0"
      data-testid={testId}
      style={{
        background: "#111411",
        border: "1px solid #23271f",
        borderRadius: 13,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

/** Panel heading with its explanatory line. */
export function DashHeading({
  title,
  sub,
  marginTop = 0,
}: {
  title: string;
  sub?: string;
  marginTop?: number;
}) {
  return (
    <>
      <div style={{ fontWeight: 600, fontSize: 16, marginTop }}>{title}</div>
      {sub ? (
        <div style={{ fontSize: 12, color: "#7d877d", margin: "4px 0 0" }}>
          {sub}
        </div>
      ) : null}
    </>
  );
}

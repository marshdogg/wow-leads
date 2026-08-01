import type { CSSProperties, ReactNode } from "react";

/** A labelled form control, matching the record's label/value type scale. */
export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: "block", minWidth: 0, ...style }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.7px",
          color: "#6f7a6f",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6 }}>{children}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "#6f7a6f", marginTop: 5 }}>
          {hint}
        </div>
      ) : null}
    </label>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  background: "#141814",
  border: "1px solid #262b25",
  borderRadius: 8,
  padding: "9px 11px",
  color: "#e9ede9",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

/** Selects need the explicit colour or the option list renders unreadable. */
export const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
};

export const optionStyle: CSSProperties = { background: "#141814" };

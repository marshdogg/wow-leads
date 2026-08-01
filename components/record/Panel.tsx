import type { CSSProperties, ReactNode } from "react";

/** The record's standard surface: `#111411` on `#23271f`, 13px radius. */
export function Panel({
  children,
  border = "#23271f",
  style,
}: {
  children: ReactNode;
  border?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#111411",
        border: `1px solid ${border}`,
        borderRadius: 13,
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 11px / 1px-tracked section label. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "1px",
        color: "#6f7a6f",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

"use client";

import { useUi } from "@/lib/store/ui";

/** Bottom-centre, auto-dismissing. Mounted once in the app layout. */
export function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      style={{
        position: "fixed",
        bottom: 26,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 80,
        background: "#141814",
        border: "1px solid #2f6b1f",
        borderRadius: 10,
        padding: "13px 20px",
        fontSize: 13,
        color: "#b6f07a",
        boxShadow: "0 14px 34px rgba(0,0,0,0.55)",
        maxWidth: "min(560px, calc(100vw - 32px))",
        textAlign: "center",
      }}
    >
      {toast}
    </div>
  );
}

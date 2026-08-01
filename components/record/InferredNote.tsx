import { RECORD_FIELDS } from "@/lib/record-fields";

/**
 * Standing caveat: this field set was inferred, because the real WOW OS
 * deal-detail screen was not available when the record was designed. The note
 * stays on the screen until that comparison happens — an unmarked guess in a
 * CRM becomes a fact nobody re-checks.
 */
export function InferredNote() {
  return (
    <div
      style={{
        border: "1px dashed #2a2f28",
        borderRadius: 12,
        padding: "15px 18px",
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
        {RECORD_FIELDS.inferredHeading}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#8b948b",
          marginTop: 7,
          lineHeight: 1.5,
        }}
      >
        {RECORD_FIELDS.inferredBody}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  RECORD_FIELDS,
  RECORD_TOASTS,
  SUGGESTIONS,
  type SuggestionId,
} from "@/lib/record-fields";
import { useUi } from "@/lib/store/ui";
import { ActorChip } from "./ActorChip";
import { Panel } from "./Panel";
import type { SuggestionBodies } from "./suggestion-copy";

const STORE_KEY = "wow-leads:dismissed-suggestions";
const STORE_EVENT = "wow-leads:suggestions-changed";
const EMPTY = "[]";

function readDismissed(): string {
  try {
    return sessionStorage.getItem(STORE_KEY) ?? EMPTY;
  } catch {
    // Private mode — nothing is dismissed, and nothing breaks.
    return EMPTY;
  }
}

function writeDismissed(next: string[]): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* non-fatal */
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}

/**
 * sessionStorage read as an external store, so the server renders the empty
 * snapshot and the client swaps in the real one without a setState-in-effect
 * round trip.
 */
function useDismissed(): string[] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(STORE_EVENT, onChange);
    return () => window.removeEventListener(STORE_EVENT, onChange);
  }, []);

  const raw = useSyncExternalStore(subscribe, readDismissed, () => EMPTY);

  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

/**
 * Three agent suggestions, each approvable or dismissible.
 *
 * Dismissal is per record *and* per suggestion — dismissing "summarize
 * history" on one deal must not silence it everywhere. Approving is a
 * decision, not a send: the toast says so explicitly, because the trust model
 * for this whole product is that a human approves every outbound touch.
 *
 * Dismissals live in sessionStorage for now. When suggestions come from the
 * drafting service they should be persisted per user like the board prefs.
 */
export function SuggestionsPanel({
  dealId,
  bodies,
}: {
  dealId: string;
  bodies: SuggestionBodies;
}) {
  const showToast = useUi((s) => s.showToast);
  const dismissed = useDismissed();

  const dismiss = (id: SuggestionId) => {
    const key = `${dealId}:${id}`;
    if (dismissed.includes(key)) return;
    writeDismissed([...dismissed, key]);
  };

  const visible = SUGGESTIONS.filter(
    (s) => !dismissed.includes(`${dealId}:${s.id}`),
  );

  if (!visible.length) return null;

  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <ActorChip agent initials="AI" size={24} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {RECORD_FIELDS.suggestionsHeading}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: "#6f7a6f" }}>
          {RECORD_FIELDS.suggestionsNote}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 14,
        }}
      >
        {visible.map((s) => (
          <div
            key={s.id}
            style={{
              border: "1px solid #262b25",
              background: "#141814",
              borderRadius: 10,
              padding: 13,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.7px",
                color: "#6f7a6f",
                fontWeight: 600,
              }}
            >
              {s.kind}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#e2e7e2",
                marginTop: 5,
                lineHeight: 1.45,
              }}
            >
              {bodies[s.id]}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <button
                type="button"
                onClick={() => {
                  dismiss(s.id);
                  showToast(RECORD_TOASTS.suggestionApproved);
                }}
                className="hover:!bg-[#16290e]"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#b6f07a",
                  border: "1px solid #2f6b1f",
                  background: "#0f1a0b",
                  padding: "8px 13px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {s.primary}
              </button>
              <button
                type="button"
                onClick={() => dismiss(s.id)}
                className="hover:!text-[#c6cdc6]"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#7d877d",
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: "transparent",
                  border: "none",
                  fontFamily: "inherit",
                }}
              >
                {RECORD_FIELDS.suggestionDismiss}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

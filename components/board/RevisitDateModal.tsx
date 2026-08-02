"use client";

/**
 * The prompt that stands between a deal and a `paused` stage.
 *
 * The mirror of `LostReasonModal`, and required for the same structural
 * reason. Pausing a deal removes it from the neglect alert — that exclusion is
 * the whole point of the reconciliation, because a bid on hold with a revisit
 * six months out was being flagged as neglected every day in between. But the
 * exclusion is only safe because a revisit date replaces the rule. Without
 * one, a paused deal is absent from the neglect list *and* generates no
 * revisit signal: invisible on both dashboards, indefinitely.
 *
 * A noisy alert gets ignored. A missing one gets trusted. So the date is
 * collected at the moment somebody chooses to pause, when they already know
 * when they expect to hear back.
 */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

export interface RevisitDateRequest {
  dealId: string;
  dealName: string;
  stageId: string;
  stageLabel: string;
}

/**
 * "Check back in a quarter" is the thought; a calendar is the interface most
 * tools offer for it. The presets carry the common intervals so nobody has to
 * count weeks, and the date field stays for the case where a real date is
 * known — a permit hearing, a budget cycle.
 */
const PRESETS: { label: string; days: number }[] = [
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
];

/** `YYYY-MM-DD` in the viewer's own timezone, for `<input type="date">`. */
function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export function RevisitDateModal({
  request,
  pending,
  onConfirm,
  onCancel,
}: {
  request: RevisitDateRequest | null;
  pending: boolean;
  /** `YYYY-MM-DD`. Parsed to a real date at the action boundary. */
  onConfirm: (revisitDate: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  // Reset between deals, adjusted during render rather than in an effect —
  // same reasoning as the lost-reason prompt: an effect paints the previous
  // deal's answer for a frame first.
  const requestKey = request ? `${request.dealId}:${request.stageId}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(requestKey);
  if (requestKey !== seenKey) {
    setSeenKey(requestKey);
    setValue("");
  }

  const cancel = useCallback(() => {
    if (!pending) onCancel();
  }, [pending, onCancel]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, cancel]);

  if (!request) return null;

  // A revisit date in the past is a deal that is already due, which is not
  // what anybody means by "pause until".
  const today = isoDay(new Date());
  const valid = Boolean(value) && value >= today;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`When should ${request.dealName} come back?`}
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,6,4,0.76)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(14px, 4vw, 32px)",
      }}
    >
      <div
        data-testid="revisit-date-modal"
        style={{
          width: 480,
          maxWidth: "100%",
          maxHeight: "100%",
          overflowY: "auto",
          background: "#111411",
          // The paused amber, matching the column it is sending the card to.
          border: "1px solid #4a3a17",
          borderRadius: 16,
          animation: "wowFade 0.2s ease both",
        }}
      >
        <header
          style={{
            padding: "20px 22px 15px",
            borderBottom: "1px solid #1f231e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.8px",
                fontWeight: 600,
                color: "#d8b45e",
              }}
            >
              PAUSING INTO {request.stageLabel.toUpperCase()}
            </div>
            <h2
              style={{
                margin: "6px 0 0",
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: "-0.3px",
              }}
            >
              When should {request.dealName} come back?
            </h2>
            <p
              style={{
                margin: "7px 0 0",
                fontSize: 12.5,
                color: "#8b948b",
                lineHeight: 1.55,
              }}
            >
              Required. Pausing takes this off the neglect alert — the revisit
              date is what puts it back in front of somebody. Without one it
              would sit on neither list.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel"
            data-testid="revisit-date-cancel-x"
            onClick={cancel}
            className="hover:!text-[#e9ede9]"
            style={{
              flex: "none",
              border: "none",
              background: "transparent",
              color: "#7d877d",
              cursor: pending ? "not-allowed" : "pointer",
              padding: 2,
              lineHeight: 0,
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        <div style={{ padding: "16px 22px" }}>
          <div
            style={{
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            {PRESETS.map((p) => {
              const iso = inDays(p.days);
              const on = value === iso;
              return (
                <button
                  key={p.label}
                  type="button"
                  data-testid={`revisit-preset-${p.days}`}
                  onClick={() => setValue(iso)}
                  className="hover:!border-[#4b9c2d]"
                  style={{
                    border: `1px solid ${on ? "#2f6b1f" : "#262b25"}`,
                    background: on ? "#0f1a0b" : "#141814",
                    color: on ? "#d5f8a8" : "#98a298",
                    borderRadius: 8,
                    padding: "8px 13px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <label style={{ display: "block", marginTop: 15 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.7px",
                color: "#6f7a6f",
                fontWeight: 600,
              }}
            >
              OR AN EXACT DATE
            </div>
            <input
              data-testid="revisit-date-input"
              type="date"
              min={today}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                background: "#141814",
                border: "1px solid #262b25",
                borderRadius: 8,
                padding: "9px 11px",
                color: "#e9ede9",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                colorScheme: "dark",
              }}
            />
          </label>
        </div>

        <footer
          style={{
            padding: "0 22px 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            data-testid="revisit-date-confirm"
            disabled={!valid || pending}
            onClick={() => valid && onConfirm(value)}
            className="hover:!bg-[#93e63a]"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0d0f0d",
              background: valid ? "#7ed321" : "#3f5c31",
              border: "none",
              padding: "11px 18px",
              borderRadius: 10,
              cursor: !valid || pending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {pending ? "Pausing…" : "Pause until then"}
          </button>
          <button
            type="button"
            data-testid="revisit-date-cancel"
            disabled={pending}
            onClick={cancel}
            className="hover:!border-[#3b423a]"
            style={{
              fontSize: 13,
              color: "#98a298",
              background: "transparent",
              border: "1px solid #262b25",
              padding: "10px 15px",
              borderRadius: 10,
              cursor: pending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Leave it where it is
          </button>
          {!value ? (
            <span style={{ fontSize: 12, color: "#6f7a6f" }}>
              Pick when to come back.
            </span>
          ) : !valid ? (
            <span style={{ fontSize: 12, color: "#c8a44e" }}>
              That date has passed — it would come back due immediately.
            </span>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

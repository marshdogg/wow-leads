"use client";

/**
 * The prompt that stands between a deal and a `lost` stage.
 *
 * This is a gate, not a form. Addendum §2.3 requires a structured
 * `lostReason` on every lost transition, and the reason is not paperwork —
 * the Lost-Lead Revival trigger keys off `lostReason = price` plus six months,
 * so a blank makes the automation silently useless. Nothing about that failure
 * is visible later: the deal looks correctly closed, and the revival that
 * should have fired next spring simply never does.
 *
 * So the move does not happen until a reason is chosen. The card stays where
 * it was during the prompt rather than moving optimistically and rolling back,
 * because a card that visibly lands in Lost and then jumps home reads as a
 * failed drag rather than an unanswered question.
 */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { LOST_REASONS, type LostReason } from "@/lib/types";

/** What the board is asking about. Null when nothing is pending. */
export interface LostReasonRequest {
  dealId: string;
  dealName: string;
  stageId: string;
  stageLabel: string;
}

/**
 * Written for the person choosing, not for the report. "No response" and
 * "Not interested" are easy to conflate under pressure and mean different
 * things to the revival trigger, so each says what it commits you to.
 */
const REASON_HINT: Record<LostReason, string> = {
  "not interested": "They told us no. Nothing changed their mind.",
  unqualified: "Not our work, out of area, or never had the budget.",
  price: "We were too expensive. This is the one revival chases later.",
  timing: "Right job, wrong moment — they may be back on their own.",
  competitor: "Somebody else got it.",
  "no response": "We never reached them. No decision was ever made.",
  other: "None of the above. Say so in the timeline afterwards.",
};

export function LostReasonModal({
  request,
  pending,
  onConfirm,
  onCancel,
}: {
  request: LostReasonRequest | null;
  pending: boolean;
  onConfirm: (reason: LostReason) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<LostReason | null>(null);

  /*
   * Reset between deals. Closing one prompt and opening another must not
   * arrive with the previous answer pre-selected — a chosen-looking default is
   * exactly how an unconsidered reason gets recorded, and this reason is the
   * one the revival trigger acts on.
   *
   * Adjusted during render against the previous request rather than in an
   * effect: an effect would paint the stale selection for a frame first, and
   * the alternative (a `key` at the call site) makes correctness depend on
   * every caller remembering it.
   */
  const requestKey = request ? `${request.dealId}:${request.stageId}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(requestKey);
  if (requestKey !== seenKey) {
    setSeenKey(requestKey);
    setReason(null);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Why was ${request.dealName} lost?`}
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
        data-testid="lost-reason-modal"
        style={{
          width: 520,
          maxWidth: "100%",
          maxHeight: "100%",
          overflowY: "auto",
          background: "#111411",
          // Bordered in the lost tone rather than the product green: this is
          // the one dialog that ends a deal.
          border: "1px solid #5c2620",
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
                color: "#e07a68",
              }}
            >
              MOVING TO {request.stageLabel.toUpperCase()}
            </div>
            <h2
              style={{
                margin: "6px 0 0",
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: "-0.3px",
              }}
            >
              Why did {request.dealName} not go ahead?
            </h2>
            <p
              style={{
                margin: "7px 0 0",
                fontSize: 12.5,
                color: "#8b948b",
                lineHeight: 1.55,
              }}
            >
              Required. The revival trigger reads this — a lead lost on price
              comes back to you in six months, and one closed without a reason
              never does.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel"
            data-testid="lost-reason-cancel-x"
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

        <div
          role="radiogroup"
          aria-label="Lost reason"
          style={{
            padding: "16px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {LOST_REASONS.map((r) => {
            const on = reason === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`lost-reason-${r.replace(/\s+/g, "-")}`}
                onClick={() => setReason(r)}
                className="hover:!border-[#4b9c2d]"
                style={{
                  textAlign: "left",
                  border: `1px solid ${on ? "#2f6b1f" : "#262b25"}`,
                  background: on ? "#0f1a0b" : "#141814",
                  borderRadius: 10,
                  padding: "10px 13px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "#e9ede9",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: on ? "#d5f8a8" : "#e2e7e2",
                    textTransform: "capitalize",
                  }}
                >
                  {r}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#8b948b",
                    marginTop: 3,
                    lineHeight: 1.45,
                  }}
                >
                  {REASON_HINT[r]}
                </div>
              </button>
            );
          })}
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
            data-testid="lost-reason-confirm"
            disabled={!reason || pending}
            onClick={() => reason && onConfirm(reason)}
            className="hover:!bg-[#93e63a]"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0d0f0d",
              background: reason ? "#7ed321" : "#3f5c31",
              border: "none",
              padding: "11px 18px",
              borderRadius: 10,
              cursor: !reason || pending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {pending ? "Closing…" : "Mark as lost"}
          </button>
          <button
            type="button"
            data-testid="lost-reason-cancel"
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
          {!reason ? (
            <span style={{ fontSize: 12, color: "#6f7a6f" }}>
              Pick a reason to continue.
            </span>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

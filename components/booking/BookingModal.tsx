"use client";

/**
 * The booking modal — the hand-off from WOW Leads into the WOW OS Funnel.
 *
 * PUBLIC SURFACE (other screens depend on exactly this):
 *
 *   import BookingModal from "@/components/booking/BookingModal";
 *   <BookingModal dealId={deal.id} open={open} onClose={() => setOpen(false)} />
 *
 * `dealId`, `open` and `onClose` are the whole required contract. Everything
 * else is optional and only saves a round trip: pass `leadName` / `address` /
 * `carries` when the caller already has the deal in hand and the modal will
 * skip its context fetch. See also `BookingButton` and `useBooking`.
 *
 * Step 1 collects day → time → estimator; step 2 is the confirmation. The
 * modal never mutates anything itself — `bookEstimateAction` does.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { X, ArrowRight, Check } from "lucide-react";
import {
  bookEstimateAction,
  getBookingContextAction,
  type BookingConfirmation,
} from "@/app/actions/booking";
import { DAYS, ESTIMATORS, TIMES } from "@/lib/pipelines";
import {
  EMPTY_SELECTION,
  bookingEyebrow,
  bookingTitle,
  canConfirm,
  missingSelection,
  sel,
  type BookingSelection,
} from "@/lib/wow-os/booking";
import { useUi } from "@/lib/store/ui";

export interface BookingModalProps {
  dealId: string;
  open: boolean;
  onClose: () => void;
  /** Optional pre-fill; the modal fetches these when omitted. */
  leadName?: string;
  address?: string;
  carries?: string[];
  /** Fires after a successful hand-off, with the Funnel's confirmation. */
  onBooked?: (confirmation: BookingConfirmation) => void;
}

interface Context {
  leadName: string;
  address: string;
  carries: string[];
}

const FALLBACK_CONTEXT: Context = {
  leadName: "this lead",
  address: "",
  carries: [
    "Account + contacts",
    "Property details",
    "Access notes",
    "Full activity with provenance",
  ],
};

/**
 * Exported both ways on purpose: `import BookingModal from …` is the documented
 * surface, and the named export exists so callers that prefer named imports
 * (the Record screen's booking seam) do not have to care.
 */
export default function BookingModal({
  dealId,
  open,
  onClose,
  leadName,
  address,
  carries,
  onBooked,
}: BookingModalProps) {
  const showToast = useUi((s) => s.showToast);

  const [selection, setSelection] = useState<BookingSelection>(EMPTY_SELECTION);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(
    null,
  );
  const [fetched, setFetched] = useState<Context | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step: 1 | 2 = confirmation ? 2 : 1;

  // Reset whenever the modal opens/closes or is pointed at a different deal, so
  // reopening never shows the previous lead's selection or confirmation. Done
  // during render rather than in an effect — React discards this render and
  // re-runs it immediately, so the stale state is never shown or committed.
  const [session, setSession] = useState({ open, dealId });
  if (session.open !== open || session.dealId !== dealId) {
    setSession({ open, dealId });
    setSelection(EMPTY_SELECTION);
    setConfirmation(null);
    setError(null);
    setFetched(null);
  }

  // The carries list is the one piece of context a caller is unlikely to have
  // in hand — the Record screen passes `leadName` and `address` but not this —
  // so its absence, not the absence of a name, is what triggers the fetch.
  const needsFetch = carries === undefined;

  useEffect(() => {
    if (!open || !needsFetch) return;
    let cancelled = false;
    void getBookingContextAction(dealId).then((ctx) => {
      if (cancelled || !ctx) return;
      setFetched({
        leadName: ctx.leadName,
        address: ctx.address,
        carries: ctx.carries,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, dealId, needsFetch]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  if (!open) return null;

  // Props win over the fetch for whatever they supply; the fetch fills the rest.
  const ctx: Context = {
    leadName: leadName ?? fetched?.leadName ?? FALLBACK_CONTEXT.leadName,
    address: address ?? fetched?.address ?? FALLBACK_CONTEXT.address,
    carries: carries ?? fetched?.carries ?? FALLBACK_CONTEXT.carries,
  };
  const ready = canConfirm(selection);
  const blocker = missingSelection(selection);

  function confirm() {
    if (!canConfirm(selection) || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await bookEstimateAction({
        dealId,
        dayIndex: selection.dayIndex as number,
        timeIndex: selection.timeIndex as number,
        estimatorIndex: selection.estimatorIndex as number,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmation(result.confirmation);
      showToast(`Booked · ${result.confirmation.osRef} in the WOW OS Funnel`);
      onBooked?.(result.confirmation);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={bookingTitle(step, ctx.leadName)}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,6,4,0.76)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        data-testid="booking-modal"
        data-step={step}
        style={{
          width: 660,
          maxHeight: "100%",
          overflowY: "auto",
          background: "#111411",
          border: "1px solid #2f6b1f",
          borderRadius: 16,
          animation: "wowFade 0.2s ease both",
        }}
      >
        <header
          style={{
            padding: "22px 24px 16px",
            borderBottom: "1px solid #1f231e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "1.1px",
                color: "#7ea85c",
                fontWeight: 600,
              }}
            >
              {bookingEyebrow(step)}
            </div>
            <div
              style={{
                fontSize: 21,
                fontWeight: 600,
                marginTop: 5,
                letterSpacing: "-0.4px",
              }}
            >
              {bookingTitle(step, ctx.leadName)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              color: "#7d877d",
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
              lineHeight: 1,
              display: "flex",
            }}
          >
            <X size={21} strokeWidth={1.6} />
          </button>
        </header>

        {step === 1 ? (
          <StepOne
            ctx={ctx}
            selection={selection}
            onSelect={setSelection}
            onConfirm={confirm}
            onCancel={handleClose}
            ready={ready}
            blocker={blocker}
            pending={pending}
            error={error}
          />
        ) : (
          <StepTwo confirmation={confirmation!} onClose={handleClose} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Step 1 — day, time, estimator
   ------------------------------------------------------------------------- */

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.9px",
  color: "#6f7a6f",
  fontWeight: 600,
  marginBottom: 11,
};

function StepOne({
  ctx,
  selection,
  onSelect,
  onConfirm,
  onCancel,
  ready,
  blocker,
  pending,
  error,
}: {
  ctx: Context;
  selection: BookingSelection;
  onSelect: (s: BookingSelection) => void;
  onConfirm: () => void;
  onCancel: () => void;
  ready: boolean;
  blocker: string | null;
  pending: boolean;
  error: string | null;
}) {
  return (
    <>
      <div
        style={{
          padding: "20px 24px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <section>
          <div style={SECTION_LABEL}>APPOINTMENT</div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {DAYS.map((d, i) => {
              const on = selection.dayIndex === i;
              const s = sel(on);
              return (
                <button
                  key={`${d.dow}-${d.date}`}
                  type="button"
                  data-testid={`booking-day-${i}`}
                  aria-pressed={on}
                  onClick={() => onSelect({ ...selection, dayIndex: i })}
                  style={{
                    border: `1px solid ${s.border}`,
                    background: s.bg,
                    color: s.color,
                    borderRadius: 9,
                    padding: "11px 15px",
                    cursor: "pointer",
                    textAlign: "center",
                    minWidth: 92,
                    font: "inherit",
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{d.dow}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                    {d.date}
                  </div>
                </button>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              gap: 9,
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            {TIMES.map((t, i) => {
              const on = selection.timeIndex === i;
              const s = sel(on);
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`booking-time-${i}`}
                  aria-pressed={on}
                  onClick={() => onSelect({ ...selection, timeIndex: i })}
                  style={{
                    border: `1px solid ${s.border}`,
                    background: s.bg,
                    color: s.color,
                    borderRadius: 9,
                    padding: "10px 15px",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: "inherit",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div style={SECTION_LABEL}>
            ESTIMATOR · LIVE FROM THE WOW OS CALENDAR
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {ESTIMATORS.map((e, i) => {
              const on = selection.estimatorIndex === i;
              const s = sel(on);
              return (
                <button
                  key={e.initials}
                  type="button"
                  data-testid={`booking-estimator-${i}`}
                  aria-pressed={on}
                  onClick={() => onSelect({ ...selection, estimatorIndex: i })}
                  style={{
                    border: `1px solid ${s.border}`,
                    background: s.bg,
                    borderRadius: 9,
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    font: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#22301b",
                      color: "#a8ea6b",
                      fontSize: 10,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                    }}
                  >
                    {e.initials}
                  </span>
                  <span>
                    <span
                      style={{ fontSize: 14, color: s.color, display: "block" }}
                    >
                      {e.name}
                    </span>
                    <span
                      style={{ fontSize: 11, color: "#6f7a6f", display: "block" }}
                    >
                      {e.load}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            border: "1px solid #23271f",
            background: "#141814",
            borderRadius: 11,
            padding: 15,
          }}
        >
          <div style={SECTION_LABEL}>
            CARRIES ACROSS THE SEAM — NOTHING RETYPED
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ctx.carries.map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 12,
                  padding: "6px 11px",
                  borderRadius: 7,
                  background: "#0f1a0b",
                  border: "1px solid #2f6b1f",
                  color: "#a8ea6b",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: "#f0a294",
              background: "#1e100e",
              border: "1px solid #5c2620",
              borderRadius: 9,
              padding: "11px 13px",
            }}
          >
            {error}
          </div>
        ) : null}
      </div>

      <footer
        style={{
          padding: "16px 24px 20px",
          borderTop: "1px solid #1f231e",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, fontSize: 12, color: "#6f7a6f" }}>
          {blocker ??
            "Confirming creates the Funnel deal and closes this out of WOW Leads."}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#98a298",
            background: "none",
            border: "1px solid #262b25",
            padding: "12px 16px",
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="booking-confirm"
          onClick={onConfirm}
          disabled={!ready || pending}
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: ready ? "#0d0f0d" : "#5c655c",
            background: ready ? "#7ed321" : "#1a1e19",
            border: ready ? "none" : "1px solid #262b25",
            padding: "12px 20px",
            borderRadius: 10,
            cursor: ready && !pending ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {pending ? "Booking…" : "Book & hand off"}
        </button>
      </footer>
    </>
  );
}

/* -------------------------------------------------------------------------
   Step 2 — one record, now in the Funnel
   ------------------------------------------------------------------------- */

function StepTwo({
  confirmation,
  onClose,
}: {
  confirmation: BookingConfirmation;
  onClose: () => void;
}) {
  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            border: "1px solid #262b25",
            background: "#141814",
            borderRadius: 11,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "1px",
              color: "#6f7a6f",
              fontWeight: 600,
            }}
          >
            WOW LEADS
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>
            {confirmation.leadName}
          </div>
          <div style={{ fontSize: 12, color: "#7ea85c", marginTop: 6 }}>
            Closed out · booked
          </div>
        </div>
        <ArrowRight size={22} color="#7ed321" strokeWidth={2} />
        <div
          style={{
            flex: 1,
            border: "1px solid #2f6b1f",
            background: "#0f1a0b",
            borderRadius: 11,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "1px",
              color: "#7ea85c",
              fontWeight: 600,
            }}
          >
            WOW OS · FUNNEL
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginTop: 6,
              color: "#e2e7e2",
            }}
          >
            {confirmation.leadName}
          </div>
          <div style={{ fontSize: 12, color: "#7ea85c", marginTop: 6 }}>
            Estimate Scheduled · {confirmation.osRef}
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #2f6b1f",
          background: "#0f1a0b",
          borderRadius: 11,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.8px",
            color: "#7ea85c",
            fontWeight: 600,
          }}
        >
          ESTIMATE APPOINTMENT
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#b6f07a",
            marginTop: 4,
          }}
        >
          {confirmation.when}
        </div>
        <div style={{ fontSize: 13, color: "#8b948b", marginTop: 4 }}>
          Estimator · {confirmation.estimatorName} · {confirmation.address}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 13,
          }}
        >
          {confirmation.carries.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 11,
                padding: "5px 10px",
                borderRadius: 6,
                background: "#16220f",
                border: "1px solid #2f6b1f",
                color: "#a8ea6b",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {c}
              <Check size={11} strokeWidth={2.5} />
            </span>
          ))}
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "#8b948b",
          marginTop: 16,
          lineHeight: 1.55,
        }}
      >
        The card now reads{" "}
        <span style={{ color: "#b6f07a" }}>Linked in WOW OS</span>. Same record,
        two views — including the AI-drafted warranty touch that started it.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            color: "#98a298",
            background: "none",
            border: "1px solid #262b25",
            padding: 13,
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Back to Leads
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            color: "#0d0f0d",
            background: "#7ed321",
            border: "none",
            padding: 13,
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Open in Funnel
        </button>
      </div>
    </div>
  );
}

export { BookingModal };

"use client";

/**
 * A Book button with the modal already wired to it — the one-line way to add
 * the hand-off to any screen:
 *
 *   <BookingButton dealId={deal.id} leadName={deal.name} />
 *
 * Screens that need their own trigger (a card CTA, a row menu) should use
 * `useBooking()` + `<BookingModal>` directly instead.
 */

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import BookingModal from "./BookingModal";
import type { BookingConfirmation } from "@/app/actions/booking";

export interface BookingButtonProps {
  dealId: string;
  /** Saves the modal a context fetch when the caller already has the deal. */
  leadName?: string;
  address?: string;
  carries?: string[];
  label?: string;
  /** Renders the full-width primary CTA used on cards. */
  variant?: "primary" | "secondary";
  onBooked?: (confirmation: BookingConfirmation) => void;
}

export default function BookingButton({
  dealId,
  leadName,
  address,
  carries,
  label = "Book estimate",
  variant = "primary",
  onBooked,
}: BookingButtonProps) {
  const [open, setOpen] = useState(false);
  const primary = variant === "primary";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "inherit",
          color: primary ? "#0d0f0d" : "#c6cdc6",
          background: primary ? "#7ed321" : "#141814",
          border: primary ? "none" : "1px solid #262b25",
          padding: "11px 16px",
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        <CalendarCheck size={15} strokeWidth={2} />
        {label}
      </button>
      <BookingModal
        dealId={dealId}
        open={open}
        onClose={() => setOpen(false)}
        leadName={leadName}
        address={address}
        carries={carries}
        onBooked={onBooked}
      />
    </>
  );
}

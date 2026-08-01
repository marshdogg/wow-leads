"use client";

import { useState } from "react";
import BookingModal from "@/components/booking/BookingModal";
import { RECORD_FIELDS, RECORD_TOASTS } from "@/lib/record-fields";
import { useUi } from "@/lib/store/ui";

/**
 * The two terminal decisions on a record: it books, or it's lost.
 *
 * "Mark lost" refuses to close silently — a lost deal without a reason is
 * data the source→revenue report cannot use, so the toast names the four
 * allowed reasons rather than just confirming.
 *
 * "Book Estimate" opens the booking workstream's day → time → estimator
 * modal. The record keeps its own trigger because this button is the page's
 * primary CTA and carries heavier styling than the shared `BookingButton`,
 * but the flow itself is entirely `BookingModal`'s — there is no second
 * implementation of the hand-off here.
 */
export function RecordActions({
  dealId,
  dealName,
  address,
}: {
  dealId: string;
  dealName: string;
  address: string;
}) {
  const showToast = useUi((s) => s.showToast);
  const [booking, setBooking] = useState(false);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <button
        type="button"
        onClick={() => showToast(RECORD_TOASTS.markLost)}
        className="hover:!text-[#f0a294] hover:!border-[#5c2620]"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#98a298",
          border: "1px solid #262b25",
          background: "transparent",
          padding: "12px 16px",
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {RECORD_FIELDS.markLost}
      </button>

      <button
        type="button"
        onClick={() => setBooking(true)}
        className="hover:!bg-[#93e63a]"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#0d0f0d",
          background: "#7ed321",
          border: "none",
          padding: "13px 22px",
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {RECORD_FIELDS.book}
      </button>

      <BookingModal
        dealId={dealId}
        open={booking}
        onClose={() => setBooking(false)}
        leadName={dealName}
        address={address}
      />
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";

/**
 * Open/close state for `BookingModal`, for screens that own the trigger
 * themselves (a card menu, a row action, the Record header).
 *
 *   const booking = useBooking();
 *   <button onClick={() => booking.open(deal.id)}>Book</button>
 *   {booking.dealId ? (
 *     <BookingModal
 *       dealId={booking.dealId}
 *       open={booking.isOpen}
 *       onClose={booking.close}
 *     />
 *   ) : null}
 *
 * `dealId` survives the close so the modal can animate out; `open(id)` on a
 * different deal swaps it cleanly.
 */
export function useBooking() {
  const [dealId, setDealId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((id: string) => {
    setDealId(id);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  return { dealId, isOpen, open, close };
}

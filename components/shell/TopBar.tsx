"use client";

import Link from "next/link";
import { Search } from "lucide-react";

/** Search field + the AI approval-queue chip that jumps to /approvals. */
export function TopBar({ approvalCount }: { approvalCount: number }) {
  const pending = approvalCount > 0;
  return (
    <div
      className="flex items-center gap-3 px-4 pt-4 sm:px-7 sm:pt-[18px]"
      style={{ flex: "none" }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: "#141814",
          border: "1px solid #23271f",
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "#6f7a6f",
        }}
      >
        <Search size={15} strokeWidth={2} className="shrink-0" />
        <span className="truncate" style={{ fontSize: 15 }}>
          Search contacts, accounts, bids
        </span>
      </div>
      <Link
        href="/approvals"
        data-testid="approval-chip"
        className="hover:!border-[#4b9c2d]"
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${pending ? "#2f6b1f" : "#262b25"}`,
          background: pending ? "#101a0b" : "#141814",
          borderRadius: 10,
          padding: "11px 16px",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "1px solid #2f6b1f",
            background: "#0f1a0b",
            color: "#a8ea6b",
            fontSize: 8,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          AI
        </div>
        {/* On a phone the chip keeps the badge and the count but drops the
            words — the full label is what pushed the bar past the viewport. */}
        <span
          className="hidden sm:inline"
          style={{
            fontSize: 13,
            color: pending ? "#b6f07a" : "#8b948b",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {pending ? `${approvalCount} awaiting approval` : "Queue clear"}
        </span>
        <span
          className="sm:hidden"
          style={{
            fontSize: 13,
            color: pending ? "#b6f07a" : "#8b948b",
            fontWeight: 500,
          }}
        >
          {pending ? approvalCount : "0"}
        </span>
      </Link>
    </div>
  );
}

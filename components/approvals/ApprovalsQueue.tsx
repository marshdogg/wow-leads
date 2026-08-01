"use client";

import { useState } from "react";
import type { Approval } from "@/lib/types";
import { ApprovalCard } from "./ApprovalCard";

/**
 * The queue.
 *
 * A decided card leaves immediately rather than waiting for the server
 * revalidation to land — the reader has just made a decision and the list
 * should reflect it. The revalidation still happens; this only removes the
 * lag between the two.
 */
export function ApprovalsQueue({ approvals }: { approvals: Approval[] }) {
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const remaining = approvals.filter((a) => !decided.has(a.id));

  function onDecided(approvalId: string) {
    setDecided((prev) => new Set(prev).add(approvalId));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        marginTop: 20,
        maxWidth: 1120,
      }}
    >
      {remaining.map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} onDecided={onDecided} />
      ))}
      {remaining.length === 0 ? <QueueClear /> : null}
    </div>
  );
}

export function QueueClear() {
  return (
    <div
      data-testid="approvals-empty"
      style={{
        border: "1px dashed #2a2f28",
        borderRadius: 13,
        padding: 40,
        textAlign: "center",
        color: "#5c655c",
        fontSize: 14,
      }}
    >
      Queue clear. Triggers keep running — the next 11-month touchpoint fires
      tomorrow.
    </div>
  );
}

/**
 * Toast copy for the approvals queue.
 *
 * Split out from `approval-machine.ts` so client components can import the
 * strings without pulling the database client into the browser bundle. These
 * are the prototype's exact words — each one tells the reader what actually
 * happened, not that a button was pressed.
 */

export const APPROVAL_TOASTS = {
  approve: (dealName: string) =>
    `Sent and logged with agent provenance — next step set on ${dealName}`,
  edit: () => "Opens the draft inline — your edits train the next one",
  skip: () =>
    "Skipped — logged as a decision, trigger will not re-fire for 90 days",
} as const;

export type ApprovalDecision = "approve" | "edit" | "skip";

export function toastFor(decision: ApprovalDecision, dealName: string): string {
  switch (decision) {
    case "approve":
      return APPROVAL_TOASTS.approve(dealName);
    case "edit":
      return APPROVAL_TOASTS.edit();
    case "skip":
      return APPROVAL_TOASTS.skip();
  }
}

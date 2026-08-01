"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveCampaignAction } from "@/app/actions/campaigns";
import { getUserById } from "@/lib/current-user";
import { useUi } from "@/lib/store/ui";
import type { CampaignApprovalState } from "./draft";

/**
 * Where a saved bulk campaign stands against its approval gate.
 *
 * Only rendered for `bulk`, because per-message campaigns approve nothing in
 * advance — every send becomes an Approvals row and a human reads it, exactly
 * as a trigger draft does.
 *
 * Three of the four states are refusals and they are deliberately not
 * interchangeable. "Nobody has approved this" is an unfinished job.
 * "Approved, then changed" is somebody's reviewed copy having been rewritten
 * underneath the tick, and it should read as the more serious of the two.
 * "Cannot be approved" is a design fact about unpinned copy, not a mistake the
 * author made, and it says what to do instead.
 */
export function ApprovalGatePanel({
  campaignId,
  state,
  /** True when the editor holds changes that have not been saved. */
  dirty,
}: {
  campaignId: string;
  state: CampaignApprovalState;
  dirty: boolean;
}) {
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  if (state.kind === "per_message") return null;

  const approve = () => {
    if (pending) return;
    startTransition(async () => {
      try {
        const res = await approveCampaignAction({ id: campaignId });
        showToast(res.toast);
      } catch {
        showToast("Could not reach the server. Nothing was approved.");
      } finally {
        // The panel's state is derived on the server from the stored hash, so
        // it only changes once the page re-renders.
        router.refresh();
      }
    });
  };

  const tone = state.kind === "approved" ? "ok" : state.kind === "stale" ? "alarm" : "warn";
  const border =
    tone === "ok" ? "#2f6b1f" : tone === "alarm" ? "#5c2620" : "#4a3a17";
  const background =
    tone === "ok" ? "#0f1a0b" : tone === "alarm" ? "#1e100e" : "#1a1608";
  const headingColor =
    tone === "ok" ? "#a8ea6b" : tone === "alarm" ? "#e07a68" : "#c8a44e";
  const bodyColor =
    tone === "ok" ? "#c6cdc6" : tone === "alarm" ? "#f0a294" : "#e6d9b4";

  return (
    <div
      data-testid="approval-gate"
      data-state={state.kind}
      style={{
        border: `1px solid ${border}`,
        background,
        borderRadius: 10,
        padding: "13px 15px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.8px",
          fontWeight: 600,
          color: headingColor,
        }}
      >
        {HEADING[state.kind]}
      </div>

      <div
        style={{
          fontSize: 13,
          color: bodyColor,
          marginTop: 5,
          lineHeight: 1.55,
        }}
      >
        {state.kind === "unapprovable" ? (
          <>
            Bulk approval fixes the exact wording that goes out, and{" "}
            {state.unpinnedSteps.length === 1
              ? `step ${state.unpinnedSteps[0]} has`
              : `steps ${state.unpinnedSteps.join(", ")} have`}{" "}
            no pinned template — that copy is chosen per record at send time, so
            there is nothing for anyone to have agreed to. Pin the copy on{" "}
            {state.unpinnedSteps.length === 1 ? "that step" : "those steps"}, or
            approve this campaign message by message instead.
          </>
        ) : null}

        {state.kind === "never" ? (
          <>
            This campaign approves in bulk and no version has been approved, so
            nothing sends — whatever the switch says. Read the steps, then
            approve the version you just read.
          </>
        ) : null}

        {state.kind === "stale" ? (
          <>
            Somebody approved this campaign on {formatDate(state.approvedAt)},
            and the audience, the steps or the copy has changed since. Sending
            is held: what was reviewed is no longer what would go out. Approve
            the current version to start it again.
          </>
        ) : null}

        {state.kind === "approved" ? (
          <>
            Approved {formatDate(state.approvedAt)}
            {state.approvedBy ? ` by ${getUserById(state.approvedBy).name}` : ""}. Every send is
            logged to the account timeline as it goes. Any edit to the audience,
            the steps or the copy clears this and holds the campaign until
            somebody approves again.
          </>
        ) : null}
      </div>

      {state.kind === "never" || state.kind === "stale" ? (
        <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            data-testid="campaign-approve"
            disabled={pending || dirty}
            onClick={approve}
            className="hover:!bg-[#93e63a]"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#0d0f0d",
              background: dirty ? "#3f5c31" : "#7ed321",
              border: "none",
              padding: "9px 15px",
              borderRadius: 9,
              cursor: pending || dirty ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {state.kind === "stale" ? "Approve this version" : "Approve and start sending"}
          </button>
          {/* Approving reads the *saved* campaign, so approving over unsaved
              edits would tick a box against copy nobody can see. */}
          {dirty ? (
            <span style={{ fontSize: 12, color: "#c8a44e" }}>
              Save your changes first — approval is recorded against what is
              stored, not what is on screen.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const HEADING: Record<CampaignApprovalState["kind"], string> = {
  per_message: "",
  unapprovable: "CANNOT BE BULK-APPROVED AS WRITTEN",
  never: "NOT APPROVED — NOTHING SENDS",
  stale: "CHANGED SINCE IT WAS APPROVED — SENDING HELD",
  approved: "APPROVED",
};

/** "12 July 2026". Written out, because this is a date in a sentence. */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

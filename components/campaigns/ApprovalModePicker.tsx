"use client";

import type { ApprovalMode } from "@/lib/campaigns/types";
import { APPROVAL_LOAD_WARNING, approvalLoad, type StepDraft } from "./draft";

/**
 * Per-message or bulk.
 *
 * The whole product's promise is that nothing is sent without a human reading
 * it, and this is the one screen where a franchise can switch that off. So it
 * is two explicit choices rather than a toggle labelled "bulk approve": a
 * toggle has an off state that reads as the absence of a decision, and this
 * decision is never absent.
 *
 * The number does the arguing. "Each draft is approved individually" sounds
 * careful right up until it means eight hundred items in a queue, at which
 * point it stops being review and becomes a person holding down Enter — which
 * is worse than bulk, because it looks like diligence.
 */
export function ApprovalModePicker({
  mode,
  onChange,
  steps,
  enrolling,
}: {
  mode: ApprovalMode;
  onChange: (mode: ApprovalMode) => void;
  steps: StepDraft[];
  /** How many people a run would enrol, from the live audience count. */
  enrolling: number;
}) {
  const perMessage = approvalLoad(steps, enrolling, "per_message");
  const heavy = perMessage > APPROVAL_LOAD_WARNING;

  return (
    <div data-testid="approval-mode">
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.7px",
          color: "#6f7a6f",
          fontWeight: 600,
        }}
      >
        APPROVAL
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: 10, marginTop: 8 }}
      >
        <ModeCard
          testId="approval-mode-per_message"
          selected={mode === "per_message"}
          onSelect={() => onChange("per_message")}
          title="Every message, one by one"
          body="Each draft goes to the Approvals queue with its “why this fired” panel. Nothing reaches a customer unread."
          meter={
            enrolling > 0
              ? `≈ ${perMessage} ${perMessage === 1 ? "item" : "items"} in the queue per run · ${steps.length} ${steps.length === 1 ? "step" : "steps"} × ${enrolling}`
              : "Nothing to approve while the audience is empty"
          }
          meterTone={heavy ? "warn" : "muted"}
        />

        <ModeCard
          testId="approval-mode-bulk"
          selected={mode === "bulk"}
          onSelect={() => onChange("bulk")}
          title="The run, once"
          body="You approve the campaign run; every send is logged to the record as it goes. Right for a newsletter, wrong for anything a customer would answer."
          meter="1 approval per run"
          meterTone="muted"
        />
      </div>

      {/*
        Shown against per-message rather than against bulk, because per-message
        is the setting that fails quietly. Bulk's risk is obvious from its own
        description; a queue nobody can get through looks fine until the day
        someone approves four hundred drafts in a minute.
      */}
      {mode === "per_message" && heavy ? (
        <div
          data-testid="approval-load-warning"
          style={{
            marginTop: 10,
            border: "1px solid #4a3a17",
            background: "#1a1608",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 13,
            color: "#e6d9b4",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "#c8a44e", fontWeight: 600 }}>
            {perMessage} drafts is more than a queue.
          </strong>{" "}
          At this size, one-by-one approval is a person clicking through a list
          rather than reading it, which is less safe than approving the run
          once and knowing that is what you did. Either narrow the audience, or
          choose the run.
        </div>
      ) : null}

      {mode === "bulk" ? (
        <div
          data-testid="approval-bulk-note"
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#8b948b",
            lineHeight: 1.55,
          }}
        >
          Every send still lands on the account timeline with the campaign named
          as its source, so the provenance is intact — what you give up is the
          chance to stop any single one before it goes.
        </div>
      ) : null}
    </div>
  );
}

function ModeCard({
  testId,
  selected,
  onSelect,
  title,
  body,
  meter,
  meterTone,
}: {
  testId: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  meter: string;
  meterTone: "muted" | "warn";
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      onClick={onSelect}
      className="hover:!border-[#4b9c2d]"
      style={{
        textAlign: "left",
        border: `1px solid ${selected ? "#2f6b1f" : "#262b25"}`,
        background: selected ? "#0f1a0b" : "#141814",
        borderRadius: 10,
        padding: "13px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "#e9ede9",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 13,
            height: 13,
            borderRadius: "50%",
            border: `1px solid ${selected ? "#7ed321" : "#3b423a"}`,
            background: selected ? "#7ed321" : "transparent",
            flex: "none",
            boxShadow: selected ? "inset 0 0 0 2.5px #0f1a0b" : "none",
          }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: selected ? "#d5f8a8" : "#e2e7e2",
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#8b948b",
          marginTop: 6,
          lineHeight: 1.5,
        }}
      >
        {body}
      </div>
      <div
        style={{
          fontSize: 11,
          color: meterTone === "warn" ? "#c8a44e" : "#6f7a6f",
          marginTop: 8,
          fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
        }}
      >
        {meter}
      </div>
    </button>
  );
}

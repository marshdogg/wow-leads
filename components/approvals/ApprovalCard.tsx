"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  approveAction,
  editAndSendAction,
  skipAction,
} from "@/app/actions/approvals";
import { APPROVAL_TOASTS } from "@/lib/agents/approval-toasts";
import { useUi } from "@/lib/store/ui";
import { CHIP_TRIGGER } from "@/lib/triggers/types";
import type { Approval } from "@/lib/types";

/**
 * One drafted touchpoint awaiting a human.
 *
 * The split is deliberate and load-bearing: the message on the left, the
 * evidence on the right. A reader should be able to check every claim in the
 * draft against a bullet before they press the green button — that is the
 * whole reason this screen exists rather than an auto-send.
 */

interface ChipStyle {
  bg: string;
  color: string;
  border: string;
}

function chipStyle(chip: string): ChipStyle {
  return chip === CHIP_TRIGGER
    ? { bg: "#0f1a0b", color: "#a8ea6b", border: "#2f6b1f" }
    : { bg: "#141814", color: "#98a298", border: "#262b25" };
}

export function ApprovalCard({
  approval,
  onDecided,
}: {
  approval: Approval;
  onDecided: (approvalId: string) => void;
}) {
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(approval.body);

  const chip = chipStyle(approval.chip);
  // A same-day trigger gets the green edge — it is the one the reader should
  // look at first.
  const border = approval.chip === CHIP_TRIGGER ? "#2f6b1f" : "#23271f";

  function decide(work: () => Promise<{ ok: boolean; toast?: string; error?: string }>) {
    startTransition(async () => {
      const result = await work();
      showToast(result.ok ? (result.toast ?? "") : (result.error ?? ""));
      if (result.ok) onDecided(approval.id);
    });
  }

  return (
    <div
      // The e2e suite targets a specific card by id and asserts it leaves the
      // DOM after a decision — see ApprovalsQueue, which filters rather than
      // hides.
      data-testid={`approval-${approval.id}`}
      style={{
        background: "#111411",
        border: `1px solid ${border}`,
        borderRadius: 13,
        overflow: "hidden",
        animation: "wowFade 0.22s ease",
        opacity: pending ? 0.55 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div
        style={{
          padding: "15px 18px",
          borderBottom: "1px solid #1f231e",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid #2f6b1f",
              background: "#0f1a0b",
              color: "#a8ea6b",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            AI
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{approval.title}</div>
            <div style={{ fontSize: 12, color: "#7d877d", marginTop: 2 }}>
              {approval.subtitle}
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.9px",
            fontWeight: 700,
            padding: "5px 9px",
            borderRadius: 5,
            background: chip.bg,
            color: chip.color,
            border: `1px solid ${chip.border}`,
            whiteSpace: "nowrap",
          }}
        >
          {approval.chip}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 0 }}>
        <div style={{ padding: 18, borderRight: "1px solid #1f231e" }}>
          <div style={SECTION_LABEL}>DRAFTED {approval.channel}</div>

          {editing ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={pending}
              rows={6}
              aria-label="Edit the drafted message"
              autoFocus
              style={{
                width: "100%",
                marginTop: 11,
                border: "1px solid #3b423a",
                background: "#141814",
                borderRadius: 10,
                padding: 15,
                fontSize: 14,
                color: "#e2e7e2",
                lineHeight: 1.6,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
          ) : (
            <div
              style={{
                marginTop: 11,
                border: "1px solid #262b25",
                background: "#141814",
                borderRadius: 10,
                padding: 15,
                fontSize: 14,
                color: "#e2e7e2",
                lineHeight: 1.6,
              }}
            >
              {approval.body}
            </div>
          )}

          <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
            {editing ? (
              <>
                <PrimaryButton
                  disabled={pending || body.trim().length < 20}
                  onClick={() =>
                    decide(() =>
                      editAndSendAction({ approvalId: approval.id, body }),
                    )
                  }
                >
                  Send edited message
                </PrimaryButton>
                <OutlineButton
                  disabled={pending}
                  onClick={() => {
                    setBody(approval.body);
                    setEditing(false);
                  }}
                >
                  Cancel
                </OutlineButton>
              </>
            ) : (
              <>
                <PrimaryButton
                  disabled={pending}
                  onClick={() =>
                    decide(() => approveAction({ approvalId: approval.id }))
                  }
                >
                  Approve &amp; send
                </PrimaryButton>
                <OutlineButton
                  disabled={pending}
                  onClick={() => {
                    setEditing(true);
                    showToast(APPROVAL_TOASTS.edit());
                  }}
                >
                  Edit first
                </OutlineButton>
                <BareButton
                  disabled={pending}
                  onClick={() => decide(() => skipAction({ approvalId: approval.id }))}
                >
                  Skip
                </BareButton>
              </>
            )}
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={SECTION_LABEL}>WHY THIS FIRED</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 12,
            }}
          >
            {approval.reasons.map((reason) => (
              <div
                key={reason}
                data-testid="approval-reason"
                style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: "#1a2a12",
                    color: "#b6f07a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                    marginTop: 2,
                  }}
                >
                  <Check size={9} strokeWidth={3} />
                </div>
                <div style={{ fontSize: 13, color: "#c6cdc6", lineHeight: 1.45 }}>
                  {reason}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 13,
              borderTop: "1px solid #1f231e",
              fontSize: 12,
              color: "#6f7a6f",
              lineHeight: 1.5,
            }}
          >
            {approval.footnote}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Buttons
   ------------------------------------------------------------------------- */

const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.9px",
  color: "#6f7a6f",
  fontWeight: 600,
};

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function HoverButton({
  children,
  onClick,
  disabled,
  base,
  hover,
}: ButtonProps & { base: CSSProperties; hover: CSSProperties }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      style={{
        border: "none",
        background: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...base,
        ...(over && !disabled ? hover : null),
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton(props: ButtonProps) {
  return (
    <HoverButton
      {...props}
      base={{
        background: "#7ed321",
        color: "#0d0f0d",
        borderRadius: 9,
        padding: "11px 20px",
        fontSize: 14,
        fontWeight: 600,
      }}
      hover={{ background: "#93e63a" }}
    />
  );
}

function OutlineButton(props: ButtonProps) {
  return (
    <HoverButton
      {...props}
      base={{
        border: "1px solid #262b25",
        color: "#c6cdc6",
        borderRadius: 9,
        padding: "11px 16px",
        fontSize: 13,
        fontWeight: 600,
      }}
      hover={{ borderColor: "#3b423a" }}
    />
  );
}

function BareButton(props: ButtonProps) {
  return (
    <HoverButton
      {...props}
      base={{
        color: "#7d877d",
        borderRadius: 9,
        padding: "11px 12px",
        fontSize: 13,
        fontWeight: 600,
      }}
      hover={{ color: "#f0a294" }}
    />
  );
}

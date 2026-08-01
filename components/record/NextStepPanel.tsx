"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { quickLogAction } from "@/app/actions/deals";
import { QUICK_LOG_ACTIONS, RECORD_FIELDS } from "@/lib/record-fields";
import { useUi } from "@/lib/store/ui";
import { Panel, SectionLabel } from "./Panel";
import type { NextStepStyle } from "./view-model";

/**
 * The next scheduled touch, and the three one-tap logs beneath it.
 *
 * Quick logging is deliberately modal-free: a rep in a driveway taps once,
 * gets a toast, and the touchpoint is already on the timeline. Anything that
 * asks for a form here does not get used.
 */
export function NextStepPanel({
  dealId,
  style,
}: {
  dealId: string;
  style: NextStepStyle;
}) {
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  const log = (kind: "Call" | "Text" | "Visit") => {
    if (pending) return;
    startTransition(async () => {
      const res = await quickLogAction({ dealId, kind });
      showToast(res.toast);
      router.refresh();
    });
  };

  return (
    <Panel border={style.panelBorder}>
      <SectionLabel>{RECORD_FIELDS.nextStepHeading}</SectionLabel>

      <div
        style={{
          border: `1px ${style.blockBorderStyle} ${style.blockBorder}`,
          background: style.blockBg,
          borderRadius: 10,
          padding: 14,
          marginTop: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.5px",
            fontWeight: 600,
            color: style.stateColor,
          }}
        >
          {style.state}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: style.labelColor,
            marginTop: 4,
            letterSpacing: "-0.3px",
          }}
        >
          {style.label}
        </div>
        <div style={{ fontSize: 12, color: "#8b948b", marginTop: 3 }}>
          {style.due}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
        {QUICK_LOG_ACTIONS.map((q) => (
          <button
            key={q.key}
            type="button"
            disabled={pending}
            onClick={() => log(q.key)}
            className="hover:!border-[#4b9c2d] hover:!text-[#b6f07a]"
            style={{
              flex: 1,
              textAlign: "center",
              border: "1px solid #262b25",
              background: "#141814",
              color: "#98a298",
              borderRadius: 8,
              padding: "10px 4px",
              fontSize: 12,
              fontWeight: 600,
              cursor: pending ? "progress" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {q.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

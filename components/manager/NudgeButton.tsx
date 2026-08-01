"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { nudgeAction } from "@/app/(app)/manager/actions";
import { useUi } from "@/lib/store/ui";

/** Assigns a concrete next step on a neglected deal — one click, no form. */
export function NudgeButton({
  dealId,
  dealName,
}: {
  dealId: string;
  dealName: string;
}) {
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await nudgeAction({ dealId, dealName });
          showToast(res.toast);
          router.refresh();
        })
      }
      className="hover:!bg-[#93e63a]"
      style={{
        textAlign: "center",
        fontSize: 12,
        fontWeight: 600,
        color: "#0d0f0d",
        background: "#7ed321",
        border: "none",
        padding: "8px 10px",
        borderRadius: 8,
        cursor: pending ? "progress" : "pointer",
        fontFamily: "inherit",
      }}
    >
      Assign a step
    </button>
  );
}

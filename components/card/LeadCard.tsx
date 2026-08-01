"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTransition } from "react";
import { EllipsisVertical } from "lucide-react";
import { quickLogAction } from "@/app/actions/deals";
import { useUi } from "@/lib/store/ui";
import type { Deal } from "@/lib/types";
import { OwnerBadge } from "./OwnerBadge";
import { AiDraftChip, TrackChip } from "./TrackChip";
import {
  QUICK_LOG_KINDS,
  type QuickLogKind,
  cardView,
  quickLogKindFor,
} from "./card-view";

/**
 * The one lead card. The board, the list view and the pipeline switcher all
 * render this component — only `collapsed` and the drag affordance differ, so
 * a change to a card is a change everywhere a card appears.
 *
 * The card owns its own behaviour (quick-log, CTA, opening the record) so a
 * caller only has to hand it a deal.
 */
export function LeadCard({
  deal,
  collapsed = false,
  draggable = false,
}: {
  deal: Deal;
  collapsed?: boolean;
  /** Board only: the whole card is the drag handle, so show the grab cursor. */
  draggable?: boolean;
}) {
  const v = cardView(deal);
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  const recordHref = `/record/${deal.id}`;

  function quickLog(kind: QuickLogKind) {
    startTransition(async () => {
      const res = await quickLogAction({ dealId: deal.id, kind });
      showToast(res.toast);
    });
  }

  function primary() {
    if (deal.act === "Review draft") {
      router.push("/approvals");
      return;
    }
    if (deal.act === "View in Funnel") {
      showToast(`${deal.name} is live in the Funnel · ${deal.osRef ?? ""}`);
      return;
    }
    const kind = quickLogKindFor(deal.act);
    if (kind) quickLog(kind);
  }

  return (
    <div
      data-testid={`lead-card-${deal.id}`}
      data-deal-id={deal.id}
      data-collapsed={collapsed ? "true" : "false"}
      className="hover:!border-[#3d4a37]"
      onClick={collapsed ? () => router.push(recordHref) : undefined}
      style={{
        flex: "none",
        background: "#181c17",
        border: `1px solid ${v.cardBorder}`,
        borderRadius: 11,
        padding: 14,
        cursor: draggable ? "grab" : collapsed ? "pointer" : "default",
        animation: "wowFade 0.22s ease both",
      }}
    >
      {v.trackChip && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 9,
            flexWrap: "wrap",
          }}
        >
          <TrackChip track={v.trackChip} />
          {v.aiPending && <AiDraftChip />}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Link
            href={recordHref}
            onClick={(e) => e.stopPropagation()}
            className="hover:!text-[#b6f07a]"
            style={{
              display: "block",
              fontWeight: 600,
              fontSize: 16,
              lineHeight: 1.25,
              color: "#e9ede9",
            }}
          >
            {deal.name}
          </Link>
          {deal.account && (
            <div style={{ fontSize: 12, color: "#7d877d", marginTop: 3 }}>
              {deal.account}
            </div>
          )}
        </div>
        <EllipsisVertical
          size={16}
          strokeWidth={2}
          aria-hidden
          style={{ color: "#6f7a6f", flex: "none" }}
        />
      </div>

      {collapsed ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 10,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                flex: "none",
                background: v.dotColor,
              }}
            />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: v.summaryColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {v.nextLabel}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#7d877d", flex: "none" }}>
            {v.summaryMeta}
          </span>
        </div>
      ) : (
        <>
          {v.tags.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 9,
                flexWrap: "wrap",
              }}
            >
              {v.tags.map((tag) => (
                <span
                  key={tag.label}
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.8px",
                    fontWeight: 600,
                    padding: "4px 7px",
                    borderRadius: 4,
                    background: tag.bg,
                    color: tag.color,
                  }}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {v.hasMetrics && (
            <div
              style={{
                display: "flex",
                marginTop: 12,
                border: "1px solid #23271f",
                borderRadius: 9,
                overflow: "hidden",
              }}
            >
              {deal.metrics.map((m) => (
                <div
                  key={m.label}
                  style={{
                    flex: 1,
                    padding: "9px 11px",
                    background: "#141814",
                    borderRight: "1px solid #23271f",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.7px",
                      color: "#6f7a6f",
                      fontWeight: 600,
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#e2e7e2",
                      marginTop: 2,
                    }}
                  >
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {v.hasSequence && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#6f7a6f",
                  marginBottom: 6,
                }}
              >
                <span>{v.sequenceName}</span>
                <span>{v.sequenceStep}</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {v.sequence.map((color, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 3,
                      background: color,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <NextActionBlock
            state={v.nextState}
            label={v.nextLabel}
            due={v.nextDue}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <OwnerBadge owner={deal.owner} />
              <span style={{ fontSize: 12, color: "#98a298" }}>{v.ownerLine}</span>
            </div>
            <span
              data-testid="stale"
              style={{ fontSize: 11, color: v.lastTouchColor }}
            >
              {v.lastTouch}
            </span>
          </div>

          {v.linked && (
            <div
              style={{
                marginTop: 11,
                paddingTop: 10,
                borderTop: "1px solid #23271f",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12,
                color: "#7ea85c",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#7ed321",
                }}
              />
              Linked in WOW OS · {deal.osRef}
            </div>
          )}

          <button
            type="button"
            onClick={primary}
            disabled={pending}
            className="hover:!bg-[#93e63a]"
            style={{
              display: "block",
              width: "100%",
              marginTop: 12,
              background: "#7ed321",
              color: "#0d0f0d",
              border: "none",
              borderRadius: 9,
              padding: 11,
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              cursor: pending ? "progress" : "pointer",
            }}
          >
            {deal.act}
          </button>

          {deal.quick && (
            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
              {QUICK_LOG_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => quickLog(kind)}
                  disabled={pending}
                  className="hover:!border-[#4b9c2d] hover:!text-[#b6f07a]"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    border: "1px solid #262b25",
                    background: "#141814",
                    color: "#98a298",
                    borderRadius: 8,
                    padding: "8px 4px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: pending ? "progress" : "pointer",
                  }}
                >
                  {kind}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Green when scheduled, red when overdue, dashed grey when nothing is set. */
function NextActionBlock({
  state,
  label,
  due,
}: {
  state: "ok" | "overdue" | "none";
  label: string;
  due: string;
}) {
  if (state === "none") {
    return (
      <div
        data-testid="next-action"
        style={{
          marginTop: 12,
          border: "1px dashed #3b423a",
          background: "#141814",
          borderRadius: 9,
          padding: "11px 13px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.6px",
            color: "#8b948b",
            fontWeight: 600,
          }}
        >
          NEXT
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: "#98a298",
            marginTop: 3,
          }}
        >
          {label}
        </div>
      </div>
    );
  }

  const overdue = state === "overdue";
  return (
    <div
      data-testid="next-action"
      style={{
        marginTop: 12,
        // Both the fill and the border live on this element — the e2e overdue
        // test reads computed backgroundColor and borderColor off it.
        border: `1px solid ${overdue ? "#5c2620" : "#2f6b1f"}`,
        background: overdue ? "#1e100e" : "#0f1a0b",
        borderRadius: 9,
        padding: "11px 13px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.6px",
          color: overdue ? "#c86a5c" : "#7ea85c",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: overdue ? "#e07a68" : "#7ed321",
          }}
        />
        {overdue ? "NEXT · OVERDUE" : "NEXT"}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: overdue ? "#f0a294" : "#b6f07a",
          marginTop: 4,
          letterSpacing: "-0.2px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: overdue ? "#c08a80" : "#84a86a",
          marginTop: 2,
        }}
      >
        {due}
      </div>
    </div>
  );
}

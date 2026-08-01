"use client";

import { tagStyle } from "@/lib/pipelines";
import type { Deal, TagStyle } from "@/lib/types";

/**
 * The channel-preference chip is derived from the primary contact, not a deal
 * tag, so it carries its own purple styling rather than falling through to the
 * default grey.
 */
const PREFERENCE_STYLE: TagStyle = { bg: "#241f2e", color: "#b19ad6" };

/** The rep's current lead: who, where, and the one thing due next. */
export function LeadHeader({
  deal,
  prefersChannel,
  initials,
}: {
  deal: Deal;
  prefersChannel: string | null;
  initials: string;
}) {
  const chips: { tag: string; style: TagStyle }[] = deal.tags.map((tag) => ({
    tag,
    style: tagStyle(tag),
  }));
  if (prefersChannel) {
    chips.push({
      tag: `PREFERS ${prefersChannel}`,
      style: PREFERENCE_STYLE,
    });
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.9px",
              color: "#7ea85c",
              fontWeight: 600,
            }}
          >
            ON SITE
          </div>
          <div
            data-testid="field-lead-name"
            style={{
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "-0.3px",
              marginTop: 2,
            }}
          >
            {deal.name}
          </div>
          <div style={{ fontSize: 12, color: "#7d877d", marginTop: 2 }}>
            {deal.account}
          </div>
        </div>
        <div
          style={{
            width: 34,
            height: 34,
            flex: "none",
            borderRadius: "50%",
            background: "#22301b",
            color: "#a8ea6b",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initials}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {chips.map(({ tag, style }) => (
          <span
            key={tag}
            style={{
              fontSize: 9,
              letterSpacing: "0.8px",
              fontWeight: 600,
              padding: "4px 7px",
              borderRadius: 4,
              background: style.bg,
              color: style.color,
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div
        data-testid="field-next-action"
        style={{
          border: "1px solid #2f6b1f",
          background: "#0f1a0b",
          borderRadius: 11,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.6px",
            color: "#7ea85c",
            fontWeight: 600,
          }}
        >
          NEXT
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "#b6f07a",
            marginTop: 3,
          }}
        >
          {deal.next?.label ?? "Not set"}
        </div>
        <div style={{ fontSize: 12, color: "#84a86a", marginTop: 2 }}>
          {deal.next?.due ?? "Required before you leave the driveway"}
        </div>
      </div>
    </>
  );
}

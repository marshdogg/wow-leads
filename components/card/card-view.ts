import { AUTOMATED_TRACK_STYLE, TRACK_STYLE, tagStyle } from "@/lib/pipelines";
import type { Deal, TagStyle, TrackStyle } from "@/lib/types";

/**
 * Everything `<LeadCard>` renders that is a pure function of the deal — a port
 * of the prototype's `card()` (WOW Leads v3.dc.html lines 1078–1117) with the
 * event handlers left behind. Keeping it separate keeps the component to
 * markup and keeps these colour decisions in one readable place.
 */

export interface CardTag extends TagStyle {
  label: string;
}

export interface CardView {
  /** Track chip, or the AUTOMATED chip when an AI draft is pending untracked. */
  trackChip: TrackStyle | null;
  aiPending: boolean;
  cardBorder: string;

  tags: CardTag[];

  hasMetrics: boolean;
  hasSequence: boolean;
  /** Four segment colours, filled up to `seq`. */
  sequence: string[];
  sequenceName: string;
  sequenceStep: string;

  nextState: "ok" | "overdue" | "none";
  nextLabel: string;
  nextDue: string;

  /** Collapsed summary: status dot + next-action label + right-aligned meta. */
  dotColor: string;
  summaryColor: string;
  summaryMeta: string;

  ownerLine: string;
  /** `initialType` wins over `stale` — Biz Dev cards show "Cold call · Jul 28". */
  lastTouch: string;
  lastTouchColor: string;

  linked: boolean;
}

export function cardView(deal: Deal): CardView {
  const track = deal.track ? TRACK_STYLE[deal.track] : undefined;
  const pending = deal.aiPending;
  const overdue = deal.next?.state === "overdue";
  const seq = deal.seq ?? 0;

  return {
    trackChip: track ?? (pending ? AUTOMATED_TRACK_STYLE : null),
    aiPending: pending,
    cardBorder: pending ? "#2f6b1f" : "#262b25",

    tags: deal.tags.map((label) => ({ label, ...tagStyle(label) })),

    hasMetrics: deal.metrics.length > 0,
    hasSequence: seq > 0,
    sequence: [1, 2, 3, 4].map((n) => (n <= seq ? "#7ed321" : "#23271f")),
    sequenceName: deal.seqName ?? "",
    sequenceStep: deal.seqStep ?? "",

    nextState: deal.next ? deal.next.state : "none",
    nextLabel: deal.next ? deal.next.label : "Not set",
    nextDue: deal.next ? deal.next.due : "Required",

    dotColor: !deal.next ? "#5c655c" : overdue ? "#e07a68" : "#7ed321",
    summaryColor: !deal.next ? "#98a298" : overdue ? "#f0a294" : "#c6cdc6",
    summaryMeta: deal.next ? deal.next.due : deal.stale || "",

    ownerLine: `${deal.owner.name} · ${deal.assignedBy}`,
    lastTouch: deal.initialType || deal.stale,
    lastTouchColor: deal.staleWarn ? "#e07a68" : "#6f7a6f",

    linked: Boolean(deal.osRef),
  };
}

/** The quick-log kind behind a primary CTA label ("Log Call" → "Call"). */
export type QuickLogKind = "Call" | "Text" | "Visit";

export const QUICK_LOG_KINDS: QuickLogKind[] = ["Call", "Text", "Visit"];

export function quickLogKindFor(act: Deal["act"]): QuickLogKind | null {
  switch (act) {
    case "Log Call":
      return "Call";
    case "Send Text":
      return "Text";
    case "Log Visit":
      return "Visit";
    default:
      return null;
  }
}

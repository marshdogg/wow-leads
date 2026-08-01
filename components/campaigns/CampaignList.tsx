"use client";

import { useTransition } from "react";
import { setCampaignActiveAction } from "@/app/actions/campaigns";
import { audienceIsSupported } from "@/lib/campaigns/audience";
import type { Campaign } from "@/lib/campaigns/types";
import { useUi } from "@/lib/store/ui";
import {
  audienceSentence,
  cadenceSummary,
  completionsAreSeededOnly,
  completionsExist,
  countIsDailyRate,
  isJobBased,
  countUnit,
  toDraft,
  type AudienceCandidate,
  type CampaignApprovalState,
  type JobCompletionSource,
  sizeAudience,
} from "./draft";

/**
 * Bulk approval states that hold every send, and the chip that says so.
 * Empty string means the campaign is free to run and the row stays quiet.
 */
const HELD: Record<CampaignApprovalState["kind"], string> = {
  per_message: "",
  approved: "",
  never: "NOT APPROVED — SENDS NOTHING",
  stale: "CHANGED SINCE APPROVAL — SENDING HELD",
  unapprovable: "UNPINNED COPY — CANNOT BE APPROVED",
};

/**
 * Campaigns grouped by category — the franchise's own headings, not ours.
 *
 * Each row carries the audience as a sentence and the number it currently
 * selects, because those two together are the only way to tell a campaign that
 * is working from one that has been quietly selecting nobody since the day it
 * was armed. A name and a toggle would hide exactly that.
 */
export function CampaignList({
  campaigns,
  selectedId,
  onSelect,
  onNew,
  candidates,
  completions,
  approvalStates,
  now,
}: {
  campaigns: Campaign[];
  selectedId: string | null;
  onSelect: (c: Campaign) => void;
  onNew: () => void;
  candidates: AudienceCandidate[];
  completions: JobCompletionSource;
  approvalStates: Record<string, CampaignApprovalState>;
  now: Date;
}) {
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  const groups = new Map<string, Campaign[]>();
  for (const c of campaigns) {
    const key = c.category || "UNCATEGORISED";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const toggle = (c: Campaign) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setCampaignActiveAction({ id: c.id, active: !c.active });
      showToast(res.toast);
    });
  };

  return (
    <div
      data-testid="campaign-list"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <button
        type="button"
        data-testid="campaign-new"
        onClick={onNew}
        className="hover:!border-[#4b9c2d] hover:!bg-[#16290e]"
        style={{
          width: "100%",
          border: "1px solid #2f6b1f",
          background: "#0f1a0b",
          color: "#a8ea6b",
          fontSize: 14,
          fontWeight: 600,
          padding: "12px 12px",
          borderRadius: 10,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New campaign
      </button>

      {[...groups].map(([group, rows]) => (
        <div key={group}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              fontWeight: 700,
              color: "#6f7a6f",
              marginBottom: 8,
            }}
          >
            {group.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((c) => {
              const on = c.id === selectedId;
              const size = sizeAudience(
                c.audience,
                candidates,
                c.reenrolAfterDays,
                now,
              );
              const supported = audienceIsSupported(
                c.audience.kind,
                completionsExist(completions),
              );
              // Supported, counted, and counted off rows nobody outside this
              // codebase created. The row says so — a chip is enough here
              // because the editor carries the full explanation.
              const seeded =
                supported &&
                isJobBased(c.audience.kind) &&
                completionsAreSeededOnly(completions);

              return (
                <div
                  key={c.id}
                  data-testid={`campaign-row-${c.id}`}
                  className="hover:!border-[#4b9c2d]"
                  style={{
                    border: `1px solid ${on ? "#2f6b1f" : "#262b25"}`,
                    background: on ? "#0f1a0b" : "#141814",
                    borderRadius: 10,
                    padding: "11px 13px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    opacity: c.active ? 1 : 0.62,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "#e9ede9",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>

                    <div
                      data-testid={`campaign-audience-${c.id}`}
                      style={{
                        fontSize: 11,
                        color: "#8b948b",
                        marginTop: 3,
                        lineHeight: 1.45,
                      }}
                    >
                      {audienceSentence(c.audience)}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "#6f7a6f",
                        marginTop: 3,
                        lineHeight: 1.45,
                      }}
                    >
                      {cadenceSummary(
                        toDraft(c).steps,
                      )}{" "}
                      ·{" "}
                      {c.approvalMode === "per_message"
                        ? "approved one by one"
                        : "approved in bulk"}
                    </div>

                    {/*
                      The count is the row's point. An unsupported audience gets
                      the reason instead of a zero, because "0" beside an armed
                      campaign is indistinguishable from "nobody qualifies
                      today" — and one of those is a data gap while the other is
                      a normal Tuesday.
                    */}
                    <div
                      data-testid={`campaign-size-${c.id}`}
                      style={{
                        fontSize: 11,
                        marginTop: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {supported ? (
                        <>
                          <span
                            style={{
                              fontFamily:
                                "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                              fontWeight: 600,
                              color: size.enrolling ? "#b6f07a" : "#8b948b",
                            }}
                          >
                            {size.enrolling}
                          </span>
                          <span style={{ color: "#6f7a6f" }}>
                            {countIsDailyRate(c.audience.kind)
                              ? `enrol ${countUnit(c.audience.kind)} · a new set tomorrow`
                              : `in the audience ${countUnit(c.audience.kind)}`}
                          </span>
                        </>
                      ) : null}

                      {/*
                        A bulk campaign whose version nobody has approved is
                        armed and silent — the toggle says live and the gate
                        holds every send. That contradiction belongs in the
                        list, because the list is where somebody scans for a
                        campaign that has stopped working.
                      */}
                      {HELD[approvalStates[c.id]?.kind ?? "per_message"] ? (
                        <span
                          data-testid={`campaign-held-${c.id}`}
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.7px",
                            fontWeight: 600,
                            padding: "3px 6px",
                            borderRadius: 4,
                            background: "#1e100e",
                            color: "#e07a68",
                          }}
                        >
                          {HELD[approvalStates[c.id]!.kind]}
                        </span>
                      ) : null}

                      {!supported ? (
                        <span
                          data-testid={`campaign-unsupported-${c.id}`}
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.7px",
                            fontWeight: 600,
                            padding: "3px 6px",
                            borderRadius: 4,
                            background: "#2b2413",
                            color: "#d8b45e",
                          }}
                        >
                          NO JOB COMPLETIONS YET — SELECTS NOBODY
                        </span>
                      ) : null}

                      {seeded ? (
                        <span
                          data-testid={`campaign-seeded-${c.id}`}
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.7px",
                            fontWeight: 600,
                            padding: "3px 6px",
                            borderRadius: 4,
                            background: "#2b2413",
                            color: "#d8b45e",
                          }}
                        >
                          SEEDED JOBS — NOT LIVE FROM WOW OS
                        </span>
                      ) : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.active}
                    aria-label={`${c.active ? "Pause" : "Activate"} ${c.name}`}
                    data-testid={`campaign-active-${c.id}`}
                    disabled={pending}
                    onClick={() => toggle(c)}
                    style={{
                      flex: "none",
                      marginTop: 2,
                      width: 38,
                      height: 22,
                      borderRadius: 11,
                      border: `1px solid ${c.active ? "#2f6b1f" : "#262b25"}`,
                      background: c.active ? "#1f2f16" : "#141814",
                      cursor: pending ? "progress" : "pointer",
                      padding: 2,
                      display: "flex",
                      justifyContent: c.active ? "flex-end" : "flex-start",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: c.active ? "#7ed321" : "#5c655c",
                        display: "block",
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!campaigns.length ? (
        <div style={{ fontSize: 13, color: "#7d877d", lineHeight: 1.55 }}>
          No campaigns yet. A campaign is for outreach that has no ladder — a
          review ask after a job, a monthly newsletter — the things that would
          sit in one board column forever.
        </div>
      ) : null}
    </div>
  );
}

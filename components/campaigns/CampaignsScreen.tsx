"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCampaignAction,
  saveCampaignAction,
} from "@/app/actions/campaigns";
import type { Campaign } from "@/lib/campaigns/types";
import { useUi } from "@/lib/store/ui";
import { ApprovalGatePanel } from "./ApprovalGatePanel";
import { CampaignEditor } from "./CampaignEditor";
import { CampaignList } from "./CampaignList";
import type { PinnableTemplate } from "./StepList";
import {
  blankDraft,
  draftIssues,
  sizeAudience,
  toDraft,
  toSaveInput,
  type AudienceCandidate,
  type CampaignApprovalState,
  type CampaignDraft,
  type JobCompletionSource,
} from "./draft";

/**
 * The Campaigns screen: outreach programmes that are deliberately not
 * pipelines.
 *
 * A pipeline has a ladder and per-deal state. These have neither — a review
 * ask is one or two sends after a job, a newsletter is recurring to a list —
 * and forcing either onto a board gives you a column every card sits in
 * forever.
 *
 * Candidate facts are loaded once by the page so the audience count is live:
 * `audienceMatches` is pure, so typing "4" and then "40" re-sizes the audience
 * in the browser with no round trip. Same arrangement as the Templates
 * preview, and for the same reason — a count that arrives a beat late reads as
 * a report you requested rather than a readout of what you just typed.
 */
export function CampaignsScreen({
  campaigns,
  candidates,
  templates,
  completions,
  approvalStates,
  nowIso,
}: {
  campaigns: Campaign[];
  candidates: AudienceCandidate[];
  templates: PinnableTemplate[];
  completions: JobCompletionSource;
  /**
   * Bulk approval standing, keyed by campaign id. Derived on the server
   * because it hashes the *resolved copy* of every step, and shipping every
   * template body to the browser to recompute it here would be a lot of bytes
   * to answer a question about four campaigns.
   */
  approvalStates: Record<string, CampaignApprovalState>;
  /** Fixed by the server, so the count cannot differ between render passes. */
  nowIso: string;
}) {
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);

  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const [selectedId, setSelectedId] = useState<string | null>(
    campaigns[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<CampaignDraft>(() =>
    campaigns[0] ? toDraft(campaigns[0]) : blankDraft(""),
  );
  const [saving, setSaving] = useState(false);

  const tags = useMemo(() => {
    const seen = new Set<string>();
    for (const c of candidates) for (const t of c.tags) seen.add(t);
    return [...seen].sort();
  }, [candidates]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const c of campaigns) if (c.category) seen.add(c.category);
    return [...seen].sort();
  }, [campaigns]);

  const size = useMemo(
    () => sizeAudience(draft.audience, candidates, draft.reenrolAfterDays, now),
    [draft.audience, draft.reenrolAfterDays, candidates, now],
  );

  const issues = draftIssues(draft);
  const blocked = issues.length > 0;

  const saved = draft.id ? campaigns.find((c) => c.id === draft.id) : undefined;
  // Compared through the save shape rather than field by field, so the check
  // covers exactly what a save would write and nothing that only lives in the
  // editor — a step's React key must not count as a change.
  const dirty = saved
    ? JSON.stringify(toSaveInput(draft)) !==
      JSON.stringify(toSaveInput(toDraft(saved)))
    : true;
  const approvalState: CampaignApprovalState =
    (draft.id ? approvalStates[draft.id] : undefined) ??
    (draft.approvalMode === "bulk" ? { kind: "never" } : { kind: "per_message" });

  const select = (c: Campaign) => {
    setSelectedId(c.id);
    setDraft(toDraft(c));
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(blankDraft(categories[0] ?? ""));
  };

  const save = () => {
    if (saving || blocked) return;
    setSaving(true);
    void (async () => {
      try {
        const res = await saveCampaignAction(toSaveInput(draft));
        if (res.ok) {
          showToast(res.toast);
          // Re-point at the saved row, or the next save on a new campaign
          // would create a second one.
          setSelectedId(res.campaign.id);
          setDraft(toDraft(res.campaign));
        } else {
          showToast(res.error);
        }
      } catch {
        // A rejected action — a dropped connection, a redeploy mid-request —
        // must still release the button. Clearing `saving` only on the happy
        // path leaves the editor permanently disabled with no way back but a
        // reload, which reads as the save having destroyed the screen.
        showToast("Could not reach the server. Nothing was saved.");
      } finally {
        setSaving(false);
        router.refresh();
      }
    })();
  };

  const remove = () => {
    const id = draft.id;
    if (!id || saving) return;
    setSaving(true);
    void (async () => {
      try {
        const res = await deleteCampaignAction({ id });
        showToast(res.toast);
        if (res.ok) startNew();
      } catch {
        showToast("Could not reach the server. Nothing was deleted.");
      } finally {
        setSaving(false);
        router.refresh();
      }
    })();
  };

  return (
    <div
      className="px-4 pt-4 pb-8 sm:px-7"
      style={{ flex: 1, minHeight: 600, overflowY: "auto" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Campaigns
        </h1>
        <div style={{ fontSize: 13, color: "#7d877d" }}>
          Outreach with no ladder — review asks, cross-sell, newsletters. Not a
          pipeline, on purpose.
        </div>
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr]"
        style={{ gap: 18, marginTop: 18, alignItems: "start" }}
      >
        <div className="min-w-0">
          <CampaignList
            campaigns={campaigns}
            selectedId={selectedId}
            onSelect={select}
            onNew={startNew}
            candidates={candidates}
            completions={completions}
            approvalStates={approvalStates}
            now={now}
          />
        </div>

        <div className="flex min-w-0 flex-col" style={{ gap: 18 }}>
          <div
            style={{
              background: "#111411",
              border: "1px solid #23271f",
              borderRadius: 13,
              padding: 18,
            }}
          >
            <CampaignEditor
              draft={draft}
              onChange={setDraft}
              size={size}
              completions={completions}
              tags={tags}
              categories={categories}
              templates={templates}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 18,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                data-testid="campaign-save"
                disabled={saving || blocked}
                onClick={save}
                className="hover:!bg-[#93e63a]"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#0d0f0d",
                  background: blocked ? "#3f5c31" : "#7ed321",
                  border: "none",
                  padding: "11px 18px",
                  borderRadius: 10,
                  cursor: saving || blocked ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {draft.id ? "Save campaign" : "Create campaign"}
              </button>

              {/* Arming is a separate act from saving. A campaign that went
                  live the moment it was written would send on the strength of
                  a half-finished thought. */}
              <button
                type="button"
                role="switch"
                aria-checked={draft.active}
                data-testid="campaign-draft-active"
                onClick={() => setDraft({ ...draft, active: !draft.active })}
                className="hover:!border-[#4b9c2d]"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: draft.active ? "#d5f8a8" : "#98a298",
                  background: draft.active ? "#0f1a0b" : "#141814",
                  border: `1px solid ${draft.active ? "#2f6b1f" : "#262b25"}`,
                  padding: "10px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {draft.active ? "Live on save" : "Saves switched off"}
              </button>

              {draft.id ? (
                <button
                  type="button"
                  data-testid="campaign-delete"
                  disabled={saving}
                  onClick={remove}
                  className="hover:!border-[#5c2620] hover:!text-[#f0a294]"
                  style={{
                    fontSize: 13,
                    color: "#7d877d",
                    background: "transparent",
                    border: "1px solid #262b25",
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    marginLeft: "auto",
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>

            {/* Below the save button on purpose: the gate is a fact about the
                stored campaign, and approving is something you do after
                writing rather than part of writing. */}
            {draft.id && approvalState.kind !== "per_message" ? (
              <div style={{ marginTop: 14 }}>
                <ApprovalGatePanel
                  campaignId={draft.id}
                  state={approvalState}
                  dirty={dirty}
                />
              </div>
            ) : null}

            {blocked ? (
              <ul
                data-testid="campaign-issues"
                style={{
                  margin: "12px 0 0",
                  padding: "0 0 0 16px",
                  fontSize: 12,
                  color: "#f0a294",
                  lineHeight: 1.6,
                }}
              >
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Field, inputStyle } from "@/components/templates/Field";
import type { Audience } from "@/lib/campaigns/types";
import { ApprovalModePicker } from "./ApprovalModePicker";
import { AudiencePicker } from "./AudiencePicker";
import { StepList, type PinnableTemplate } from "./StepList";
import {
  reenrolSentence,
  type AudienceSize,
  type CampaignDraft,
  type JobCompletionSource,
  type StepDraft,
} from "./draft";

/**
 * The campaign editor.
 *
 * Ordered the way the decision is actually made — who, then what, then how it
 * is reviewed, then how often. Approval sits *after* the steps because its
 * cost is a function of them, and the number it quotes would be meaningless
 * above a section the author has not filled in yet.
 */
export function CampaignEditor({
  draft,
  onChange,
  size,
  completions,
  tags,
  categories,
  templates,
}: {
  draft: CampaignDraft;
  onChange: (next: CampaignDraft) => void;
  size: AudienceSize;
  completions: JobCompletionSource;
  tags: string[];
  /** Categories already in use, offered but not enforced. */
  categories: string[];
  templates: PinnableTemplate[];
}) {
  const set = <K extends keyof CampaignDraft>(k: K, v: CampaignDraft[K]) =>
    onChange({ ...draft, [k]: v });

  return (
    <div
      data-testid="campaign-editor"
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <Field label="NAME">
          <input
            data-testid="campaign-name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Google review ask"
            style={inputStyle}
          />
        </Field>

        <Field
          label="CATEGORY"
          hint="Where this sits in the rail. Type a new one — categories are yours to invent, the same way stages are."
        >
          <input
            data-testid="campaign-category"
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
            list="campaign-categories"
            placeholder="REVIEWS"
            style={inputStyle}
          />
          <datalist id="campaign-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field
          label="DESCRIPTION"
          hint="What this is for, in a sentence. It is what the next person reads before deciding whether to turn it off."
        >
          <textarea
            data-testid="campaign-description"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </Field>
      </div>

      <Divider />

      <AudiencePicker
        audience={draft.audience}
        onChange={(audience: Audience) => set("audience", audience)}
        size={size}
        completions={completions}
        tags={tags}
      />

      <Divider />

      <StepList
        steps={draft.steps}
        onChange={(steps: StepDraft[]) => set("steps", steps)}
        templates={templates}
      />

      <Divider />

      <ApprovalModePicker
        mode={draft.approvalMode}
        onChange={(mode) => set("approvalMode", mode)}
        steps={draft.steps}
        enrolling={size.enrolling}
      />

      <Divider />

      <div data-testid="reenrol">
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.7px",
            color: "#6f7a6f",
            fontWeight: 600,
          }}
        >
          RE-ENROLMENT
        </div>

        {/* Two named choices rather than one toggle. "Once only" as a switch
            that is merely off does not say what the on state would be, and the
            difference between never and eventually is the difference between a
            warranty check-in and an annual one. */}
        <div
          role="radiogroup"
          aria-label="Re-enrolment"
          style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <Choice
            testId="reenrol-never"
            label="Once only"
            selected={draft.reenrolAfterDays === null}
            onSelect={() => set("reenrolAfterDays", null)}
          />
          <Choice
            testId="reenrol-window"
            label="Again after a while"
            selected={draft.reenrolAfterDays !== null}
            onSelect={() =>
              set("reenrolAfterDays", draft.reenrolAfterDays ?? 90)
            }
          />
        </div>

        {draft.reenrolAfterDays === null ? null : (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 9,
              flexWrap: "wrap",
              fontSize: 14,
              color: "#c6cdc6",
            }}
          >
            <span>Not again within</span>
            <input
              data-testid="reenrol-days"
              aria-label="Re-enrolment window in days"
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.reenrolAfterDays}
              onChange={(e) =>
                set("reenrolAfterDays", Number(e.target.value || 1))
              }
              style={{
                ...inputStyle,
                width: 78,
                flex: "none",
                textAlign: "center",
                fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
              }}
            />
            <span>days</span>
          </div>
        )}

        <div
          data-testid="reenrol-note"
          style={{
            fontSize: 12,
            color: "#8b948b",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          {reenrolSentence(draft.reenrolAfterDays, draft.audience.kind)}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#23271f" }} />;
}

/** A named alternative in a small radio group. */
function Choice({
  testId,
  label,
  selected,
  onSelect,
}: {
  testId: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
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
        border: `1px solid ${selected ? "#2f6b1f" : "#262b25"}`,
        background: selected ? "#0f1a0b" : "#141814",
        color: selected ? "#d5f8a8" : "#98a298",
        borderRadius: 8,
        padding: "8px 13px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

"use client";

import type { TemplateFacts } from "@/lib/templates/types";
import {
  eligibilityExplanation,
  previewTemplate,
  smsLength,
  usesContactName,
  type TemplateDraft,
} from "./draft";
import { optionStyle, selectStyle } from "./Field";

export interface PreviewDeal {
  id: string;
  name: string;
}

/**
 * The template rendered against a real record.
 *
 * This is where an author finds out their template does not apply to the
 * person they had in mind — which is the point. An ineligible template is
 * explained, never flagged as an error: falling through to a less specific
 * template is the system working correctly.
 */
export function TemplatePreview({
  draft,
  deals,
  dealId,
  onDealChange,
  facts,
}: {
  draft: TemplateDraft;
  deals: PreviewDeal[];
  dealId: string;
  onDealChange: (id: string) => void;
  facts: TemplateFacts | null;
}) {
  const deal = deals.find((d) => d.id === dealId);
  const result = facts ? previewTemplate(draft, facts) : null;
  const explanation =
    result && deal ? eligibilityExplanation(result, deal.name) : null;
  const sms = draft.channel === "SMS" ? smsLength(result?.body ?? "") : null;
  const named = usesContactName(draft);

  return (
    <div
      data-testid="template-preview"
      style={{
        background: "#111411",
        border: "1px solid #23271f",
        borderRadius: 13,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#6f7a6f",
            fontWeight: 600,
          }}
        >
          PREVIEW
        </div>
        <select
          aria-label="Preview against record"
          data-testid="preview-deal-picker"
          value={dealId}
          onChange={(e) => onDealChange(e.target.value)}
          style={{ ...selectStyle, width: "auto", maxWidth: 260 }}
        >
          {deals.map((d) => (
            <option key={d.id} value={d.id} style={optionStyle}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {result?.unknown.length ? (
        <div
          data-testid="template-unknown-tokens"
          style={{
            marginTop: 13,
            border: "1px solid #5c2620",
            background: "#1e100e",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              fontWeight: 600,
              color: "#e07a68",
            }}
          >
            UNRECOGNISED VARIABLES
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#f0a294",
              marginTop: 5,
              lineHeight: 1.5,
            }}
          >
            {result.unknown.map((t) => `{{${t}}}`).join(", ")} —{" "}
            {result.unknown.length === 1 ? "this is not a" : "these are not"}{" "}
            variable{result.unknown.length === 1 ? "" : "s"} the system knows,
            so saving will be rejected. Check the spelling against the list on
            the right.
          </div>
        </div>
      ) : null}

      {explanation ? (
        <div
          data-testid="template-eligibility"
          style={{
            marginTop: 13,
            border: "1px solid #4a3a17",
            background: "#1a1608",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              fontWeight: 600,
              color: "#c8a44e",
            }}
          >
            WON&rsquo;T BE USED HERE
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#e6d9b4",
              marginTop: 5,
              lineHeight: 1.5,
            }}
          >
            {explanation}
          </div>
        </div>
      ) : result ? (
        <div
          data-testid="template-eligibility"
          style={{
            marginTop: 13,
            fontSize: 12,
            color: "#7ea85c",
          }}
        >
          Eligible for {deal?.name} — every variable resolves.
        </div>
      ) : null}

      {result ? (
        <div
          style={{
            marginTop: 13,
            border: "1px solid #262b25",
            background: "#141814",
            borderRadius: 10,
            padding: "13px 15px",
          }}
        >
          {result.subject !== null ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#e2e7e2",
                paddingBottom: 9,
                marginBottom: 9,
                borderBottom: "1px solid #23271f",
              }}
            >
              {result.subject || (
                <span style={{ color: "#5c655c" }}>No subject</span>
              )}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 14,
              color: "#e2e7e2",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {result.body || (
              <span style={{ color: "#5c655c" }}>Nothing to preview yet.</span>
            )}
          </div>
        </div>
      ) : null}

      {/*
        Both checks are counted, not judged, and share the muted tone of a
        caption. Segment boundaries are a fact about the carrier and a missing
        name is a fact about the text; "this reads salesy" would be an opinion
        in a warning's clothing, and one noisy check devalues the honest ones
        beside it.
      */}
      {sms ? (
        <div
          data-testid="template-sms-length"
          style={{ fontSize: 11, color: "#6f7a6f", marginTop: 9 }}
        >
          {sms.characters} characters · {sms.segments}{" "}
          {sms.segments === 1 ? "segment" : "segments"}
          {sms.unicode
            ? " · contains a non-GSM character (a curly quote or dash), which halves the per-segment budget"
            : ""}
        </div>
      ) : null}

      {!named ? (
        <div
          data-testid="template-name-note"
          style={{ fontSize: 11, color: "#6f7a6f", marginTop: sms ? 4 : 9 }}
        >
          This message never uses the contact&rsquo;s name. Add{" "}
          <code
            style={{
              fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
            }}
          >
            {"{{contact.firstName}}"}
          </code>{" "}
          if that isn&rsquo;t deliberate.
        </div>
      ) : null}
    </div>
  );
}

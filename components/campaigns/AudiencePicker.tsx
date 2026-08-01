"use client";

import type { CSSProperties } from "react";
import { AUDIENCE_KINDS, audienceKindSpec } from "@/lib/campaigns/audience";
import type { Audience, AudienceKind } from "@/lib/campaigns/types";
import {
  inputStyle,
  optionStyle,
  selectStyle,
} from "@/components/templates/Field";
import {
  allStages,
  audienceGap,
  countIsDailyRate,
  countUnit,
  paramKind,
  sampleSentence,
  type AudienceSize,
  type JobCompletionSource,
} from "./draft";

/**
 * Who a campaign goes to, written as a sentence rather than laid out as a
 * form.
 *
 * A form of four fields would make the audience look like a query, and a query
 * is exactly what this is not — it is a closed set of parameterised kinds, one
 * dropdown and one blank. Rendering it as prose keeps the reader's attention
 * on what the rule *says* rather than on which boxes are filled, which matters
 * because the two job-based kinds read almost identically as fields and mean
 * completely different things: one is a moment, the other is a state.
 */
export function AudiencePicker({
  audience,
  onChange,
  size,
  completions,
  tags,
}: {
  audience: Audience;
  onChange: (next: Audience) => void;
  size: AudienceSize;
  completions: JobCompletionSource;
  /** Every tag in use, for the tag picker. */
  tags: string[];
}) {
  const spec = audienceKindSpec(audience.kind);
  const gap = audienceGap(audience, size, completions);
  const daily = countIsDailyRate(audience.kind);
  const sample = sampleSentence(size);

  // Changing kind clears the parameters. Carrying `days: 4` across to
  // `no_job_in_months` would leave a stale number sitting in an object the new
  // kind never reads, and it would reappear if the author changed back.
  const setKind = (kind: AudienceKind) => onChange({ kind, params: {} });

  const setParams = (params: Audience["params"]) =>
    onChange({ kind: audience.kind, params: { ...audience.params, ...params } });

  return (
    <div data-testid="audience-picker">
      <div style={labelStyle}>AUDIENCE</div>

      <select
        data-testid="audience-kind"
        aria-label="Audience kind"
        value={audience.kind}
        onChange={(e) => setKind(e.target.value as AudienceKind)}
        style={{ ...selectStyle, marginTop: 6 }}
      >
        {AUDIENCE_KINDS.map((k) => (
          <option key={k.kind} value={k.kind} style={optionStyle}>
            {k.label}
          </option>
        ))}
      </select>

      <div style={{ fontSize: 11, color: "#6f7a6f", marginTop: 6, lineHeight: 1.45 }}>
        {spec.description}
      </div>

      {/* The sentence. One blank, filled inline. */}
      <div
        data-testid="audience-sentence"
        style={{
          marginTop: 13,
          border: "1px solid #262b25",
          background: "#141814",
          borderRadius: 10,
          padding: "14px 15px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 15,
          color: "#e2e7e2",
          lineHeight: 1.6,
        }}
      >
        <ParamControl audience={audience} onChange={setParams} tags={tags} />
      </div>

      {/*
        Rule one, said out loud where the number is. An author reading "4 days"
        assumes a threshold — every other date filter they have used is one —
        and the consequence of that assumption is a customer who gets asked for
        a Google review every morning for the rest of their life.
      */}
      {daily ? (
        <div
          data-testid="audience-exact-day-note"
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#8b948b",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "#c6cdc6", fontWeight: 600 }}>
            That day exactly, not that day onwards.
          </strong>{" "}
          Somebody who finished{" "}
          {typeof audience.params.days === "number"
            ? `${audience.params.days + 1} days`
            : "a day later"}{" "}
          ago is not in this audience. A review ask is a moment; “four or more
          days since the job” would select the same customer again every
          morning and leave the re-enrolment window as the only thing between
          them and a daily nag.
        </div>
      ) : null}

      <AudienceCount size={size} kind={audience.kind} sample={sample} muted={Boolean(gap)} />

      {gap ? (
        <div
          data-testid="audience-gap"
          style={{
            marginTop: 12,
            border: `1px solid ${gap.systemic ? "#4a3a17" : "#262b25"}`,
            background: gap.systemic ? "#1a1608" : "#141814",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              fontWeight: 600,
              color: gap.systemic ? "#c8a44e" : "#8b948b",
            }}
          >
            {gap.heading}
          </div>
          <div
            style={{
              fontSize: 13,
              color: gap.systemic ? "#e6d9b4" : "#98a298",
              marginTop: 5,
              lineHeight: 1.55,
            }}
          >
            {gap.body}
          </div>
          {gap.systemic ? (
            <div
              style={{
                fontSize: 12,
                color: "#c8a44e",
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              You can build and save it now. It will start selecting people the
              day the Funnel starts sending completion dates — no edit needed
              here.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   The blank in the sentence
   ------------------------------------------------------------------------- */

function ParamControl({
  audience,
  onChange,
  tags,
}: {
  audience: Audience;
  onChange: (params: Audience["params"]) => void;
  tags: string[];
}) {
  const { params } = audience;

  switch (paramKind(audience.kind)) {
    case "days":
      return (
        <>
          <span>Customers whose job finished</span>
          <NumberBlank
            testId="audience-days"
            label="Days after the job finished"
            value={params.days}
            min={0}
            onChange={(days) => onChange({ days })}
          />
          <span>days ago</span>
        </>
      );

    case "months":
      return (
        <>
          <span>Customers we haven’t worked for in</span>
          <NumberBlank
            testId="audience-months"
            label="Months of silence"
            value={params.months}
            min={1}
            onChange={(months) => onChange({ months })}
          />
          <span>months or more</span>
        </>
      );

    case "tag":
      return (
        <>
          <span>Everyone tagged</span>
          {/* An input with a datalist rather than a select: the tag set is
              whatever the accounts happen to carry, and a franchise adding a
              new one should not have to wait for it to appear in a list. */}
          <input
            data-testid="audience-tag"
            aria-label="Tag"
            list="campaign-audience-tags"
            value={params.tag ?? ""}
            onChange={(e) => onChange({ tag: e.target.value })}
            placeholder="DIRECT HOMEOWNER"
            style={{
              ...inputStyle,
              width: "auto",
              minWidth: 0,
              flex: "1 1 200px",
              fontSize: 15,
              padding: "7px 10px",
            }}
          />
          <datalist id="campaign-audience-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </>
      );

    case "pipelineStage": {
      const value =
        params.pipelineId && params.stageId
          ? `${params.pipelineId}:${params.stageId}`
          : "";
      return (
        <>
          <span>Everyone sitting in</span>
          <select
            data-testid="audience-stage"
            aria-label="Pipeline and stage"
            value={value}
            onChange={(e) => {
              const [pipelineId, stageId] = e.target.value.split(":");
              onChange({ pipelineId, stageId });
            }}
            style={{
              ...selectStyle,
              width: "auto",
              minWidth: 0,
              flex: "1 1 220px",
              fontSize: 15,
              padding: "7px 10px",
            }}
          >
            <option value="" style={optionStyle}>
              Pick a stage…
            </option>
            {allStages().map((s) => (
              <option
                key={`${s.pipelineId}:${s.stageId}`}
                value={`${s.pipelineId}:${s.stageId}`}
                style={optionStyle}
              >
                {s.label}
              </option>
            ))}
          </select>
        </>
      );
    }
  }
}

function NumberBlank({
  testId,
  label,
  value,
  min,
  onChange,
}: {
  testId: string;
  label: string;
  value: number | undefined;
  min: number;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <input
      data-testid={testId}
      aria-label={label}
      type="number"
      min={min}
      inputMode="numeric"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        // An empty field is "not yet said", not zero. Zero is a real answer to
        // "how many days after the job" — the day of completion — so the two
        // cannot collapse into each other.
        onChange(raw === "" ? undefined : Number(raw));
      }}
      style={{
        ...inputStyle,
        width: 74,
        flex: "none",
        fontSize: 15,
        fontWeight: 600,
        padding: "7px 10px",
        textAlign: "center",
        fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
      }}
    />
  );
}

/* -------------------------------------------------------------------------
   The count
   ------------------------------------------------------------------------- */

/**
 * The number that tells someone whether their campaign is sane before they arm
 * it — and the unit that number is in, which is not the same for every kind.
 *
 * "28 right now" is a population you could list. "3 today" is a rate: a fresh
 * handful crosses day four every morning and none of them is the same person.
 * Printing both as a bare integer beside the word "audience" would invite an
 * owner to read the review campaign's 3 as "this reaches three people", when
 * over a year it reaches everyone.
 */
function AudienceCount({
  size,
  kind,
  sample,
  muted,
}: {
  size: AudienceSize;
  kind: AudienceKind;
  sample: string | null;
  muted: boolean;
}) {
  const daily = countIsDailyRate(kind);

  return (
    <div
      data-testid="audience-size"
      style={{
        marginTop: 13,
        border: "1px solid #262b25",
        background: "#141814",
        borderRadius: 10,
        padding: "13px 15px",
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div
        data-testid="audience-size-count"
        style={{
          fontSize: 30,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-1px",
          color: muted ? "#5c655c" : "#b6f07a",
          fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
        }}
      >
        {size.enrolling}
      </div>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#c6cdc6", lineHeight: 1.5 }}>
          {daily
            ? "enrol today. A different set enrols tomorrow — this is a daily rate, not a list."
            : `in this audience right now, out of ${size.total} records.`}
        </div>
        {sample ? (
          <div
            data-testid="audience-size-sample"
            style={{ fontSize: 11, color: "#6f7a6f", marginTop: 4, lineHeight: 1.45 }}
          >
            {sample}
          </div>
        ) : null}
        {size.blocked > 0 ? (
          <div
            data-testid="audience-size-blocked"
            style={{ fontSize: 11, color: "#c8a44e", marginTop: 4, lineHeight: 1.45 }}
          >
            {size.blocked} more {size.blocked === 1 ? "matches" : "match"} but{" "}
            {size.blocked === 1 ? "was" : "were"} enrolled too recently to enter
            again.
          </div>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.8px",
          fontWeight: 600,
          color: "#6f7a6f",
          flex: "none",
        }}
      >
        {countUnit(kind).toUpperCase()}
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.7px",
  color: "#6f7a6f",
  fontWeight: 600,
};

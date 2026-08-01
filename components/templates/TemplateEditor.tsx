"use client";

import type { RefObject } from "react";
import { PIPELINE_IDS, PIPES } from "@/lib/pipelines";
import type { TemplateChannel } from "@/lib/templates/types";
import type { PipelineId, StageId, TrackId, TriggerType } from "@/lib/types";
import {
  allStages,
  allTracks,
  TRIGGER_TYPES,
  triggerLabel,
  type TemplateDraft,
} from "./draft";
import { Field, inputStyle, optionStyle, selectStyle } from "./Field";

const CHANNELS: TemplateChannel[] = ["ANY", "SMS", "EMAIL", "PHONE"];

/** `null` is "Any" for every scope dimension — the widest setting. */
const ANY = "__any__";

export function TemplateEditor({
  draft,
  onChange,
  bodyRef,
}: {
  draft: TemplateDraft;
  onChange: (next: TemplateDraft) => void;
  /** Owned by the screen so the variable palette can insert at the caret. */
  bodyRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) =>
    onChange({ ...draft, [k]: v });

  return (
    <div
      data-testid="template-editor"
      style={{ display: "flex", flexDirection: "column", gap: 15 }}
    >
      {draft.isDefault ? (
        <div
          data-testid="template-fork-notice"
          style={{
            border: "1px solid #2f6b1f",
            background: "#0f1a0b",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 13,
            color: "#b6f07a",
            lineHeight: 1.5,
          }}
        >
          This is copy we ship. Saving creates <strong>your own version</strong>{" "}
          and leaves ours untouched, so a future update can still improve the
          default without overwriting your wording. Yours will be preferred from
          then on.
        </div>
      ) : null}

      <Field label="NAME">
        <input
          data-testid="template-name"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          style={inputStyle}
          placeholder="11-month warranty check-in"
        />
      </Field>

      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: 15 }}
      >
        <Field label="CHANNEL">
          <select
            data-testid="template-channel"
            value={draft.channel}
            onChange={(e) => set("channel", e.target.value as TemplateChannel)}
            style={selectStyle}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c} style={optionStyle}>
                {c === "ANY" ? "Any channel" : c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="TRIGGER" hint="Which agent trigger this copy answers.">
          <select
            data-testid="template-scope-trigger"
            value={draft.triggerType ?? ANY}
            onChange={(e) =>
              set(
                "triggerType",
                e.target.value === ANY
                  ? null
                  : (e.target.value as TriggerType),
              )
            }
            style={selectStyle}
          >
            <option value={ANY} style={optionStyle}>
              Any trigger
            </option>
            {TRIGGER_TYPES.map((t) => (
              <option key={t} value={t} style={optionStyle}>
                {triggerLabel(t)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="PIPELINE">
          <select
            data-testid="template-scope-pipeline"
            value={draft.pipelineId ?? ANY}
            onChange={(e) =>
              set(
                "pipelineId",
                e.target.value === ANY
                  ? null
                  : (e.target.value as PipelineId),
              )
            }
            style={selectStyle}
          >
            <option value={ANY} style={optionStyle}>
              Any pipeline
            </option>
            {PIPELINE_IDS.map((id) => (
              <option key={id} value={id} style={optionStyle}>
                {PIPES[id].title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="TRACK">
          <select
            data-testid="template-scope-track"
            value={draft.track ?? ANY}
            onChange={(e) =>
              set(
                "track",
                e.target.value === ANY ? null : (e.target.value as TrackId),
              )
            }
            style={selectStyle}
          >
            <option value={ANY} style={optionStyle}>
              Any track
            </option>
            {allTracks().map((t) => (
              <option key={t.id} value={t.id} style={optionStyle}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="STAGE"
          hint="The narrowest scope — a stage-specific template beats every other match."
          style={{ gridColumn: "1 / -1" }}
        >
          <select
            data-testid="template-scope-stage"
            value={draft.stageId ?? ANY}
            onChange={(e) =>
              set(
                "stageId",
                e.target.value === ANY ? null : (e.target.value as StageId),
              )
            }
            style={selectStyle}
          >
            <option value={ANY} style={optionStyle}>
              Any stage
            </option>
            {allStages().map((s) => (
              <option key={s.id} value={s.id} style={optionStyle}>
                {s.pipeline} · {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {draft.channel === "EMAIL" ? (
        <Field label="SUBJECT">
          <input
            data-testid="template-subject"
            value={draft.subject ?? ""}
            onChange={(e) => set("subject", e.target.value)}
            style={inputStyle}
          />
        </Field>
      ) : null}

      <Field
        label="MESSAGE"
        hint="Every variable you use narrows who this template can be sent to."
      >
        <textarea
          data-testid="template-body"
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => set("body", e.target.value)}
          rows={9}
          style={{
            ...inputStyle,
            resize: "vertical",
            lineHeight: 1.55,
            fontSize: 14,
          }}
        />
      </Field>
    </div>
  );
}

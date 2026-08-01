"use client";

import { useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { VOICE_FIELDS } from "@/lib/voice/types";
import type { EditableFields } from "@/lib/voice/types";

export type VoiceStage = "idle" | "listening" | "parsing" | "captured";

const TITLE: Record<VoiceStage, string> = {
  idle: "Hold to talk",
  listening: "Listening…",
  parsing: "Note captured",
  captured: "Note captured",
};

const SUBTITLE: Record<VoiceStage, string> = {
  idle: "No form. Say what happened, we do the rest.",
  listening: "Tap again to stop",
  parsing: "Tap the mic to record another",
  captured: "Tap the mic to record another",
};

/** A textarea that looks exactly like the read-only value line it replaces. */
function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <label
      style={{
        display: "block",
        border: "1px solid #262b25",
        background: "#141814",
        borderRadius: 9,
        padding: "10px 12px",
        cursor: "text",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.8px",
          color: "#6f7a6f",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        data-testid={`voice-field-${label.toLowerCase().replace(/\s+/g, "-")}`}
        style={{
          display: "block",
          width: "100%",
          marginTop: 3,
          padding: 0,
          border: "none",
          outline: "none",
          resize: "none",
          overflow: "hidden",
          background: "transparent",
          color: "#e2e7e2",
          fontFamily: "inherit",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      />
    </label>
  );
}

export function VoiceCapture({
  stage,
  transcript,
  fields,
  saving,
  loggedAs,
  onToggle,
  onFieldChange,
  onSave,
}: {
  stage: VoiceStage;
  transcript: string;
  fields: EditableFields | null;
  saving: boolean;
  loggedAs: string;
  onToggle: () => void;
  onFieldChange: (key: keyof EditableFields, value: string) => void;
  onSave: () => void;
}) {
  const active = stage !== "idle";
  const listening = stage === "listening";

  return (
    <div
      data-testid="voice-block"
      data-stage={stage}
      style={{
        border: `1px solid ${active ? "#2f6b1f" : "#262b25"}`,
        background: active ? "#0f1a0b" : "#141814",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="voice-toggle"
          aria-label={listening ? "Stop recording" : "Start recording"}
          onClick={onToggle}
          disabled={stage === "parsing" || saving}
          className="wf-mic"
          style={{
            width: 52,
            height: 52,
            flex: "none",
            borderRadius: "50%",
            border: "none",
            padding: 0,
            background: listening ? "#e07a68" : "#7ed321",
            color: "#0d0f0d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: stage === "parsing" || saving ? "default" : "pointer",
            animation: listening ? "wowPulse 1.2s ease-in-out infinite" : "none",
          }}
        >
          <Mic size={20} strokeWidth={2} color="#0d0f0d" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: active ? "#b6f07a" : "#e2e7e2",
            }}
          >
            {TITLE[stage]}
          </div>
          <div style={{ fontSize: 12, color: "#7d877d", marginTop: 2 }}>
            {SUBTITLE[stage]}
          </div>
        </div>
      </div>

      {active && transcript ? (
        <div
          data-testid="voice-transcript"
          style={{
            marginTop: 14,
            border: "1px solid #262b25",
            background: "#0d0f0d",
            borderRadius: 10,
            padding: 13,
            fontSize: 13,
            color: "#c6cdc6",
            lineHeight: 1.55,
            fontStyle: "italic",
          }}
        >
          {`“${transcript}”`}
        </div>
      ) : null}

      {stage === "parsing" || (stage === "captured" && fields) ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              color: "#7ea85c",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                border: "1px solid #2f6b1f",
                background: "#0f1a0b",
                color: "#a8ea6b",
                fontSize: 7,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
              }}
            >
              AI
            </span>
            {stage === "parsing"
              ? "STRUCTURING INTO FIELDS…"
              : "STRUCTURED INTO FIELDS"}
          </div>

          {fields && stage === "captured" ? (
            <>
              <div
                data-testid="voice-fields"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                {VOICE_FIELDS.map(({ key, label }) => (
                  <FieldInput
                    key={key}
                    label={label}
                    value={fields[key]}
                    onChange={(next) => onFieldChange(key, next)}
                  />
                ))}
              </div>

              <button
                type="button"
                data-testid="voice-save"
                onClick={onSave}
                disabled={saving}
                className="wf-save hover:!bg-[#93e63a]"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 12,
                  background: "#7ed321",
                  color: "#0d0f0d",
                  border: "none",
                  borderRadius: 10,
                  padding: 13,
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save to timeline"}
              </button>
              <div
                style={{
                  fontSize: 11,
                  color: "#6f7a6f",
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                Logged as: {loggedAs} · structured by agent
              </div>
            </>
          ) : (
            <div
              style={{
                marginTop: 10,
                height: 52,
                borderRadius: 9,
                border: "1px solid #262b25",
                background: "#141814",
                animation: "wowPulse 1.2s ease-in-out infinite",
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

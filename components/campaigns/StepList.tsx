"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import {
  inputStyle,
  optionStyle,
  selectStyle,
} from "@/components/templates/Field";
import {
  newStep,
  runLengthDays,
  schedule,
  STEP_CHANNELS,
  TEMPLATE_NULL_NOTE,
  TEMPLATE_PINNED_NOTE,
  type StepChannel,
  type StepDraft,
} from "./draft";

/** Just enough of a template for the pin dropdown. Structural on purpose. */
export interface PinnableTemplate {
  id: string;
  name: string;
  /** "SMS" | "EMAIL" | "PHONE" | "ANY". */
  channel: string;
}

const CHANNEL_LABEL: Record<StepChannel, string> = {
  SMS: "Text",
  EMAIL: "Email",
  PHONE: "Call",
};

/**
 * The steps, in order, each with the day it lands on.
 *
 * The model stores a delay *relative to the previous step*, which is what the
 * runner needs and what an author reliably miscounts. So the field says
 * "3 days after the step above" and the heading beside it says "DAY 3" — the
 * number they were actually trying to set.
 */
export function StepList({
  steps,
  onChange,
  templates,
}: {
  steps: StepDraft[];
  onChange: (next: StepDraft[]) => void;
  templates: PinnableTemplate[];
}) {
  const rows = schedule(steps);
  const total = runLengthDays(steps);

  const patch = (key: string, next: Partial<StepDraft>) =>
    onChange(steps.map((s) => (s.key === key ? { ...s, ...next } : s)));

  /**
   * Delays are stored relative to the previous step, but an author editing the
   * order is thinking about *which message lands on which day* — the cadence
   * is the thing they already decided. So both edits below hold the absolute
   * day slots still and re-derive the relative delays underneath.
   *
   * Without this, swapping a day-0 step with a day-3 one leaves both on day 3,
   * and deleting the middle of a 0/3/10 programme pulls the last step forward
   * to day 7. Neither is what the arrow or the cross appears to promise.
   */
  const withDaysHeld = (reordered: StepDraft[], days: number[]): StepDraft[] => {
    let prev = 0;
    return reordered.map((s, i) => {
      const day = days[i] ?? prev;
      const next = { ...s, delayDays: Math.max(0, day - prev) };
      prev = day;
      return next;
    });
  };

  const remove = (key: string) => {
    const days = rows.map((r) => r.day);
    const at = steps.findIndex((s) => s.key === key);
    if (at < 0) return;
    const kept = steps.filter((s) => s.key !== key);
    // The surviving steps keep the days they had; the freed slot just goes.
    onChange(withDaysHeld(kept, days.filter((_, i) => i !== at)));
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(withDaysHeld(next, rows.map((r) => r.day)));
  };

  const add = () => onChange([...steps, newStep(steps.length ? 3 : 0)]);

  return (
    <div data-testid="step-list">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.7px",
            color: "#6f7a6f",
            fontWeight: 600,
          }}
        >
          STEPS · {steps.length}
        </div>
        <div style={{ fontSize: 11, color: "#6f7a6f" }}>
          {steps.length > 1
            ? `Runs ${total} days from the moment someone enters`
            : "One send, then they are done"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 10,
        }}
      >
        {rows.map(({ step, day }, i) => {
          const usable = templates.filter(
            (t) => t.channel === "ANY" || t.channel === step.channel,
          );
          const pinned = usable.find((t) => t.id === step.templateId);

          return (
            <div
              key={step.key}
              data-testid={`campaign-step-${i}`}
              style={{
                border: "1px solid #262b25",
                background: "#141814",
                borderRadius: 10,
                padding: "12px 13px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  data-testid={`campaign-step-day-${i}`}
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.8px",
                    fontWeight: 700,
                    color: "#a8ea6b",
                    background: "#101a0b",
                    border: "1px solid #2f6b1f",
                    borderRadius: 5,
                    padding: "3px 7px",
                    fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                    flex: "none",
                  }}
                >
                  DAY {day}
                </span>

                <input
                  data-testid={`campaign-step-label-${i}`}
                  aria-label={`Step ${i + 1} name`}
                  value={step.label}
                  onChange={(e) => patch(step.key, { label: e.target.value })}
                  placeholder="Ask for the review"
                  style={{
                    ...inputStyle,
                    flex: "1 1 160px",
                    minWidth: 0,
                    width: "auto",
                    fontWeight: 600,
                  }}
                />

                <div style={{ display: "flex", gap: 4, flex: "none" }}>
                  <IconButton
                    label={`Move step ${i + 1} up`}
                    testId={`campaign-step-up-${i}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={13} strokeWidth={2} />
                  </IconButton>
                  <IconButton
                    label={`Move step ${i + 1} down`}
                    testId={`campaign-step-down-${i}`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={13} strokeWidth={2} />
                  </IconButton>
                  <IconButton
                    label={`Remove step ${i + 1}`}
                    testId={`campaign-step-remove-${i}`}
                    onClick={() => remove(step.key)}
                  >
                    <X size={13} strokeWidth={2} />
                  </IconButton>
                </div>
              </div>

              {/*
                One wrapping row rather than a two-column grid. The grid's
                `auto` column got squeezed at the 1440 review width and broke
                "5 | days after the step above" across two lines with the
                selects still beside it — a sentence split by a layout rule
                that only wanted to make room. Flowing the three groups lets
                them sit on one line when they fit and wrap whole when they
                don't.
              */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 13,
                    color: "#98a298",
                    flex: "1 1 auto",
                    minWidth: 0,
                  }}
                >
                  {/*
                    Step one measures from enrolment, every other step from the
                    one above it. When step one is at zero — which is what a
                    campaign should almost always do, because *when* someone
                    enters is the audience's job and not the step's — there is
                    no number worth showing, so it states the fact instead of
                    offering a control set to 0.
                  */}
                  {i === 0 && step.delayDays === 0 ? (
                    <span>Sends as soon as they enter</span>
                  ) : (
                    <>
                      <input
                        data-testid={`campaign-step-delay-${i}`}
                        aria-label={`Step ${i + 1} delay in days`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={step.delayDays}
                        onChange={(e) =>
                          patch(step.key, {
                            delayDays: Number(e.target.value || 0),
                          })
                        }
                        style={{
                          ...inputStyle,
                          width: 64,
                          flex: "none",
                          textAlign: "center",
                          fontFamily:
                            "var(--font-plex-mono), 'IBM Plex Mono', monospace",
                        }}
                      />
                      <span>
                        {i === 0
                          ? "days after they enter — usually the audience’s job, not this"
                          : "days after the step above"}
                      </span>
                    </>
                  )}
                </div>

                {/*
                  `nowrap` is the load-bearing bit. The two selects travel as a
                  unit: a channel that wrapped away from the template it
                  constrains reads as an unrelated control, and letting them
                  break against each other put "Email" alone on a line above
                  its own step's delay. With nowrap they stay side by side and
                  the *pair* drops to the next line when the row can't seat it.
                */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "nowrap",
                    gap: 8,
                    flex: "1 1 300px",
                    minWidth: 0,
                    justifyContent: "flex-end",
                  }}
                >
                  <select
                    data-testid={`campaign-step-channel-${i}`}
                    aria-label={`Step ${i + 1} channel`}
                    value={step.channel}
                    onChange={(e) => {
                      const channel = e.target.value as StepChannel;
                      // A pin that cannot be sent down the new channel is
                      // cleared rather than left to fail validation at save.
                      const keep = templates.find(
                        (t) =>
                          t.id === step.templateId &&
                          (t.channel === "ANY" || t.channel === channel),
                      );
                      patch(step.key, {
                        channel,
                        templateId: keep ? step.templateId : null,
                      });
                    }}
                    style={{ ...selectStyle, width: "auto", flex: "0 0 118px" }}
                  >
                    {STEP_CHANNELS.map((c) => (
                      <option key={c} value={c} style={optionStyle}>
                        {CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>

                  <select
                    data-testid={`campaign-step-template-${i}`}
                    aria-label={`Step ${i + 1} template`}
                    value={step.templateId ?? ""}
                    onChange={(e) =>
                      patch(step.key, { templateId: e.target.value || null })
                    }
                    style={{
                      ...selectStyle,
                      width: "auto",
                      flex: "1 1 170px",
                      minWidth: 0,
                      // A select clips rather than ellipsizes by default, and a
                      // half-printed word reads as a rendering fault.
                      textOverflow: "ellipsis",
                    }}
                  >
                    <option value="" style={optionStyle}>
                      Chosen at send time
                    </option>
                    {usable.map((t) => (
                      <option key={t.id} value={t.id} style={optionStyle}>
                        Pin “{t.name}”
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/*
                Null is the recommended state, so it gets the plain explanation
                and pinning gets the caveat — the reverse of how an empty field
                usually reads. Making the default look like an unfilled blank
                would push every author into pinning, and a campaign written in
                March would still be sending March's wording next winter.
              */}
              <div
                data-testid={`campaign-step-template-note-${i}`}
                style={{
                  fontSize: 11,
                  color: pinned ? "#c8a44e" : "#6f7a6f",
                  marginTop: 8,
                  lineHeight: 1.45,
                }}
              >
                {pinned ? TEMPLATE_PINNED_NOTE : TEMPLATE_NULL_NOTE}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="campaign-step-add"
        onClick={add}
        className="hover:!border-[#4b9c2d] hover:!bg-[#16290e]"
        style={{
          marginTop: 10,
          width: "100%",
          border: "1px dashed #2f6b1f",
          background: "transparent",
          color: "#a8ea6b",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 12px",
          borderRadius: 10,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
        }}
      >
        <Plus size={14} strokeWidth={2.5} /> Add a step
      </button>
    </div>
  );
}

function IconButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="hover:!border-[#4b9c2d]"
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: "1px solid #262b25",
        background: "#181c17",
        color: disabled ? "#3b423a" : "#8b948b",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

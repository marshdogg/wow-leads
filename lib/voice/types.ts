/**
 * Voice note → structured fields.
 *
 * The Field screen renders exactly four labelled fields (OUTCOME, NEXT STEP,
 * SCOPE NOTES, CONSTRAINT). `date` and `dueAt` are the machine-readable half of
 * NEXT STEP: `date` is folded into the rendered NEXT STEP value ("… · suggested
 * Thu Aug 6") and `dueAt` is what the next-action row is actually set to.
 */
export interface ParsedNote {
  outcome: string;
  nextStep: string;
  /** Human date suggestion, e.g. "Thu Aug 6". Empty when nothing was inferred. */
  date: string;
  /** Scope notes — rooms, work types, colour and brand. */
  notes: string;
  /** Hard constraint — a deadline, a budget ceiling, an access rule. */
  constraint: string;
  /** ISO date backing `date`, or null. Never edited by the rep. */
  dueAt: string | null;
}

/** Which implementation produced a parse — surfaced in the audit payload. */
export type ParserKind = "claude" | "deterministic";

export interface ParseResult extends ParsedNote {
  parsedBy: ParserKind;
}

/** The four fields the rep can edit before saving. */
export interface EditableFields {
  outcome: string;
  nextStep: string;
  notes: string;
  constraint: string;
}

export interface VoiceField {
  key: keyof EditableFields;
  label: string;
}

export const VOICE_FIELDS: VoiceField[] = [
  { key: "outcome", label: "OUTCOME" },
  { key: "nextStep", label: "NEXT STEP" },
  { key: "notes", label: "SCOPE NOTES" },
  { key: "constraint", label: "CONSTRAINT" },
];

const SUGGESTED = " · suggested ";

/** Fold the suggested date into the NEXT STEP value the rep sees and edits. */
export function toEditableFields(note: ParsedNote): EditableFields {
  return {
    outcome: note.outcome,
    nextStep:
      note.nextStep && note.date
        ? `${note.nextStep}${SUGGESTED}${note.date}`
        : note.nextStep,
    notes: note.notes,
    constraint: note.constraint,
  };
}

/** Split an edited NEXT STEP value back into a next-action label and due line. */
export function splitNextStep(value: string): { label: string; due: string } {
  const at = value.indexOf(SUGGESTED);
  if (at === -1) return { label: value.trim(), due: "" };
  return {
    label: value.slice(0, at).trim(),
    due: value.slice(at + SUGGESTED.length).trim(),
  };
}

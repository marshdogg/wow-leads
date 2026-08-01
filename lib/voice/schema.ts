import { z } from "zod";

/** Every server-action boundary in this module validates through these. */

export const transcriptSchema = z
  .string()
  .trim()
  .max(4000, "Transcript is too long to structure in one note.");

export const parseVoiceInput = z.object({
  transcript: transcriptSchema,
});

export const parsedNoteSchema = z.object({
  outcome: z.string().max(300),
  nextStep: z.string().max(300),
  date: z.string().max(60),
  notes: z.string().max(1200),
  constraint: z.string().max(400),
  dueAt: z.string().datetime().nullable(),
});

export const editableFieldsSchema = z.object({
  outcome: z.string().trim().min(1, "An outcome is required.").max(300),
  nextStep: z.string().trim().max(300),
  notes: z.string().trim().max(1200),
  constraint: z.string().trim().max(400),
});

export const saveVoiceNoteInput = z.object({
  dealId: z.string().min(1),
  transcript: transcriptSchema,
  fields: editableFieldsSchema,
  dueAt: z.string().datetime().nullable().optional(),
  actorUserId: z.string().min(1),
});

export const logOutcomeInput = z.object({
  dealId: z.string().min(1),
  kind: z.enum(["Call", "Text", "Visit"]),
  actorUserId: z.string().min(1),
});

export const claudeFieldsSchema = z.object({
  outcome: z.string().max(300),
  nextStep: z.string().max(300),
  notes: z.string().max(1200),
  constraint: z.string().max(400),
});

/**
 * The JSON schema handed to Claude. Structured outputs reject the constraint
 * keywords Zod would otherwise emit, so it is written out by hand and the
 * response is re-validated with `claudeFieldsSchema` afterwards.
 *
 * Deliberately no `date` field: calendar maths is the deterministic resolver's
 * job, so the model can't invent a Thursday that doesn't exist.
 */
export const CLAUDE_JSON_SCHEMA = {
  type: "object",
  properties: {
    outcome: {
      type: "string",
      description:
        "What happened, one sentence. Note scope growth explicitly if the job got bigger.",
    },
    nextStep: {
      type: "string",
      description:
        'Imperative next action including its relative timing, e.g. "Book estimate this week". Never name a calendar date.',
    },
    notes: {
      type: "string",
      description:
        "Scope notes: rooms, work types, paint brand and colour. Empty string if none.",
    },
    constraint: {
      type: "string",
      description:
        'Hard deadline, budget ceiling or access rule, e.g. "Must complete before October — daughter\'s wedding". Empty string if none.',
    },
  },
  required: ["outcome", "nextStep", "notes", "constraint"],
  additionalProperties: false,
} as const;

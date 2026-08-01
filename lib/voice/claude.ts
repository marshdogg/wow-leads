import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_JSON_SCHEMA, claudeFieldsSchema } from "./schema";
import { parseTranscriptDeterministic } from "./parse";
import type { ParsedNote } from "./types";

const MODEL = "claude-sonnet-5";

const SYSTEM = [
  "You turn a painting sales rep's spoken field note into four structured CRM fields.",
  "",
  "Rules:",
  "- Only use facts the rep actually said. Never invent scope, prices, or names.",
  "- OUTCOME: one sentence on what happened. If the job grew, say so explicitly.",
  "- NEXT STEP: an imperative action with its relative timing (\"Book estimate this week\").",
  "  Never name a calendar date — the system resolves that.",
  "- SCOPE NOTES: rooms, work types, paint brand and colour, in as few words as read cleanly.",
  "- CONSTRAINT: a hard deadline, budget ceiling or access rule, phrased as an instruction",
  "  (\"Must complete before October — daughter's wedding\").",
  "- Any field with nothing to say is an empty string. Do not pad.",
].join("\n");

/**
 * Claude implementation of the transcript parser.
 *
 * The deterministic parser still runs: it supplies the resolved calendar date
 * and is the fallback for a missing key, an API error, a refusal, or a response
 * that fails validation. That means the screen behaves identically with or
 * without ANTHROPIC_API_KEY set — only the prose gets better.
 */
export async function parseTranscriptWithClaude(
  transcript: string,
  now: Date = new Date(),
): Promise<ParsedNote> {
  const baseline = parseTranscriptDeterministic(transcript, now);
  if (!transcript.trim()) return baseline;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: CLAUDE_JSON_SCHEMA },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: transcript }],
    });

    if (response.stop_reason === "refusal") return baseline;

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return baseline;

    const parsed = claudeFieldsSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return baseline;

    return {
      ...parsed.data,
      // Calendar maths stays with the deterministic resolver.
      date: baseline.date,
      dueAt: baseline.dueAt,
    };
  } catch {
    return baseline;
  }
}

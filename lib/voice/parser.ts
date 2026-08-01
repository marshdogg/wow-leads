import { parseTranscriptDeterministic } from "./parse";
import { parseTranscriptWithClaude } from "./claude";
import type { ParseResult, ParserKind } from "./types";

/**
 * One parser interface, two implementations, selected by key presence.
 *
 * There is no ANTHROPIC_API_KEY in dev or demo, so the deterministic parser is
 * the path that actually runs — see lib/voice/parse.ts.
 */
export interface TranscriptParser {
  readonly kind: ParserKind;
  parse(transcript: string, now?: Date): Promise<ParseResult>;
}

const deterministic: TranscriptParser = {
  kind: "deterministic",
  async parse(transcript, now = new Date()) {
    return {
      ...parseTranscriptDeterministic(transcript, now),
      parsedBy: "deterministic",
    };
  },
};

const claude: TranscriptParser = {
  kind: "claude",
  async parse(transcript, now = new Date()) {
    return {
      ...(await parseTranscriptWithClaude(transcript, now)),
      parsedBy: "claude",
    };
  },
};

export function getTranscriptParser(): TranscriptParser {
  return process.env.ANTHROPIC_API_KEY ? claude : deterministic;
}

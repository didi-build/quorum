import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";
import {
  getAnthropicClient,
  getCouncilChairModel,
  COUNCIL_CHAIR_TEMPERATURE,
} from "../llm/factory.js";
import { textFromMessageContent } from "../llm/message-content.js";
import {
  isVerdict,
  type CouncilDecision,
  type PersonaOpinion,
  type Verdict,
} from "../schemas/council.js";

/** Matches v1 `CHAIR_SYSTEM_PROMPT` (`domain/council/chair.py`) except one em dash is a semicolon (pending Diadem). */
export const CHAIR_SYSTEM_PROMPT = `You are the chair of a decision council. You receive three persona opinions
(UX/end-user, developer experience, business/product) on a strategic question.

Synthesize them into one overall recommendation. Write the synthesis in third person or imperative
voice; never first person. Weigh areas of agreement and disagreement. Choose an overall verdict
(approve, request_changes, or comment) that reflects a reasoned judgment, not a mechanical rule.`;

export const CHAIR_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    overall_verdict: {
      type: "string",
      enum: ["approve", "request_changes", "comment"],
      description: "Overall council verdict after synthesis.",
    },
    synthesis: {
      type: "string",
      description: "Third person or imperative synthesis of the three opinions.",
    },
  },
  required: ["overall_verdict", "synthesis"],
  additionalProperties: false,
} as const;

interface ChairOutput {
  overall_verdict: Verdict;
  synthesis: string;
}

function formatOpinions(opinions: PersonaOpinion[]): string {
  const sections: string[] = [];
  for (const opinion of opinions) {
    sections.push(
      `Persona: ${opinion.persona}\n` +
        `Verdict: ${opinion.verdict}\n` +
        `Reasoning: ${opinion.reasoning}`,
    );
  }
  return sections.join("\n\n");
}

function parseChairOutput(rawJson: string): ChairOutput {
  if (rawJson.length === 0) {
    throw new Error("Council chair model returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Council chair model returned non-JSON output");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Council chair model returned invalid JSON shape");
  }

  const record = parsed as { overall_verdict?: unknown; synthesis?: unknown };
  if (
    typeof record.synthesis !== "string" ||
    typeof record.overall_verdict !== "string"
  ) {
    throw new Error("Council chair model returned an invalid synthesis shape");
  }
  if (!isVerdict(record.overall_verdict)) {
    throw new Error("Council chair model returned an invalid overall verdict");
  }

  return { overall_verdict: record.overall_verdict, synthesis: record.synthesis };
}

export interface SynthesizeDecisionParams {
  personaOpinions: PersonaOpinion[];
  config: QuorumConfig;
  client?: Anthropic;
}

export async function synthesizeDecision(
  params: SynthesizeDecisionParams,
): Promise<CouncilDecision> {
  const client = params.client ?? getAnthropicClient(params.config);
  const response = await client.messages.create({
    model: getCouncilChairModel(params.config),
    max_tokens: 2048,
    temperature: COUNCIL_CHAIR_TEMPERATURE,
    system: CHAIR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          "Persona opinions:\n\n" +
          `${formatOpinions(params.personaOpinions)}\n\n` +
          "Provide the overall verdict and synthesis:",
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: CHAIR_OUTPUT_SCHEMA,
      },
    },
  });

  const output = parseChairOutput(textFromMessageContent(response.content, ""));

  return {
    persona_opinions: params.personaOpinions,
    overall_verdict: output.overall_verdict,
    synthesis: output.synthesis,
  };
}

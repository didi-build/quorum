import type { Citation } from "./citation.js";

export const VERDICTS = ["approve", "request_changes", "comment"] as const;

export type Verdict = (typeof VERDICTS)[number];

export interface PersonaOpinion {
  persona: string;
  verdict: Verdict;
  reasoning: string;
  citations: Citation[];
}

export interface CouncilDecision {
  persona_opinions: PersonaOpinion[];
  overall_verdict: Verdict;
  synthesis: string;
}

import type { Citation } from "./citation.js";

export const VERDICTS = ["approve", "request_changes", "comment"] as const;

export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}

/** Council review input (v1 `ReviewRequest`). */
export interface ReviewRequest {
  query: string;
  project_id: string | null;
}

/** One seat opinion (v1 `PersonaOpinion`). */
export interface PersonaOpinion {
  persona: string;
  verdict: Verdict;
  reasoning: string;
  citations: Citation[];
}

/** Chair output bundled with persona opinions (v1 `CouncilDecision`). */
export interface CouncilDecision {
  persona_opinions: PersonaOpinion[];
  overall_verdict: Verdict;
  synthesis: string;
}

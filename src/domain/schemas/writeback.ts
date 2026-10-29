export const WRITE_BACK_PROPOSAL_STATUSES = [
  "proposed",
  "confirmed",
  "executed",
] as const;

export type WriteBackProposalStatus = (typeof WRITE_BACK_PROPOSAL_STATUSES)[number];

export interface WriteBackPlan {
  needs_doc_update: boolean;
  doc_target: "existing" | "new" | null;
  existing_doc_path: string | null;
  new_doc_slug: string | null;
  needs_roadmap_item: boolean;
}

export interface WriteBackFeedbackEntry {
  feedback: string;
  created_at: string;
}

export interface WriteBackExecutionResult {
  kind: "github_pr" | "linear_issue";
  label: string;
  url: string;
}

export interface WriteBackProposalOut {
  id: string;
  chat_message_id: string;
  user_id: string;
  project_id: string | null;
  plan: WriteBackPlan;
  feedback_history: WriteBackFeedbackEntry[];
  status: WriteBackProposalStatus;
  execution_results: WriteBackExecutionResult[];
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

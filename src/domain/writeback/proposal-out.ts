import type {
  WriteBackExecutionResult,
  WriteBackFeedbackEntry,
  WriteBackPlan,
  WriteBackProposalOut,
  WriteBackProposalStatus,
} from "../schemas/writeback.js";

export interface WriteBackProposalRow {
  id: string;
  chat_message_id: string;
  user_id: string;
  project_id: string | null;
  plan: string;
  feedback_history: string;
  status: string;
  execution_results: string;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

export function toProposalOut(row: WriteBackProposalRow): WriteBackProposalOut {
  return {
    id: row.id,
    chat_message_id: row.chat_message_id,
    user_id: row.user_id,
    project_id: row.project_id,
    plan: JSON.parse(row.plan) as WriteBackPlan,
    feedback_history: JSON.parse(row.feedback_history) as WriteBackFeedbackEntry[],
    status: row.status as WriteBackProposalStatus,
    execution_results: JSON.parse(row.execution_results) as WriteBackExecutionResult[],
    created_at: row.created_at,
    updated_at: row.updated_at,
    executed_at: row.executed_at,
  };
}

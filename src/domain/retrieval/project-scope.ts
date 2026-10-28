import type { ActorContext } from "../schemas/actor.js";
import { isRetrievalProjectUuid } from "./query-limits.js";

export type RetrievalProjectScopeResult =
  | { ok: true; effectiveProjectId: string | null }
  | { ok: false; status: 400 | 404; detail: string };

/**
 * Resolve retrieval project scope without widening the actor (Quorum security, not v1 parity).
 */
export function resolveRetrievalProjectScope(
  actor: ActorContext,
  bodyProjectId: string | null | undefined,
): RetrievalProjectScopeResult {
  if (bodyProjectId !== undefined && bodyProjectId !== null) {
    if (!isRetrievalProjectUuid(bodyProjectId)) {
      return { ok: false, status: 400, detail: "project_id must be a UUID" };
    }
  }

  if (actor.projectId !== null) {
    if (
      bodyProjectId !== undefined &&
      bodyProjectId !== null &&
      bodyProjectId !== actor.projectId
    ) {
      return { ok: false, status: 404, detail: "Not Found" };
    }
    return { ok: true, effectiveProjectId: actor.projectId };
  }

  if (bodyProjectId !== undefined && bodyProjectId !== null) {
    return { ok: false, status: 404, detail: "Not Found" };
  }

  return { ok: true, effectiveProjectId: null };
}

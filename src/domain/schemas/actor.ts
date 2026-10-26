/** Authenticated actor for HTTP and WebSocket handlers (v1 `ActorContext`). */
export interface ActorContext {
  userId: string;
  projectId: string | null;
}

export function actorContext(
  userId: string,
  projectId: string | null = null,
): ActorContext {
  return { userId, projectId };
}

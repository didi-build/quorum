/**
 * Nullable `user_id` on scoped tables means global access in `can_access()` (ADR 0008).
 * That is only for deliberately seeded rows. User-facing write paths must always set
 * the actor user id from auth context, never from the request body.
 */
export function userIdForScopedRow(actorUserId: string | null): string {
  if (actorUserId === null || actorUserId === "") {
    throw new Error("actor user id is required for scoped rows");
  }
  return actorUserId;
}

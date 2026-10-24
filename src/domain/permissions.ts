/**
 * Single shared authorization check for all resource reads and writes (v1 ADR 0004).
 */
export function can_access(
  actorUserId: string,
  actorProjectId: string | null,
  resourceUserId: string | null,
  resourceProjectId: string | null,
): boolean {
  if (resourceUserId === null && resourceProjectId === null) {
    return true;
  }
  if (resourceUserId !== null && resourceUserId !== actorUserId) {
    return false;
  }
  if (resourceProjectId !== null && resourceProjectId !== actorProjectId) {
    return false;
  }
  return true;
}

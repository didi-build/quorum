import type { ResponseKind } from "../../types/chat";

export function responseKindRouteLabel(responseKind: ResponseKind | null): string {
  if (responseKind === "council_result") {
    return "Council review";
  }
  if (responseKind === "stub_not_implemented") {
    return "Linear request";
  }
  return "Direct answer";
}

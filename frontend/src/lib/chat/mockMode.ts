/** Dev-only mock transport; production builds always use live endpoints. */
export function isChatMockMode(): boolean {
  if (import.meta.env.PROD) {
    return false;
  }
  return import.meta.env.VITE_CHAT_MOCK !== "false";
}

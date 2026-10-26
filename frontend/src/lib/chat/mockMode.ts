/** Dev and mock-preview mock transport; production builds use live endpoints. */
export function isChatMockMode(): boolean {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "mock-preview")) {
    return false;
  }
  return import.meta.env.VITE_CHAT_MOCK !== "false";
}

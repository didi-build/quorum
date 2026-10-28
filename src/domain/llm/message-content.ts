/** Join Anthropic message text blocks; empty yields a fixed safe string for users. */
export function textFromMessageContent(
  content: Array<{ type: string; text?: string }>,
  emptyFallback: string,
): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  if (parts.length === 0) {
    return emptyFallback;
  }
  return parts.join("");
}

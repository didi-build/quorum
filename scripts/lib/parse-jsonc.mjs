/**
 * Minimal JSONC parse for wrangler.jsonc (// line comments, trailing commas).
 * Does not strip `//` inside string literals (e.g. URLs).
 */
export function parseJsonc(text) {
  const withoutComments = text
    .split("\n")
    .map((line) => stripLineComment(line))
    .join("\n");
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[\]}])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}

function stripLineComment(line) {
  let inString = false;
  let escape = false;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString && c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && c === "/" && line[i + 1] === "/") {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

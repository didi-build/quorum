/** Matches `uses:` at step or job level, with or without a leading `- `. */
const USES_RE = /^\s*(?:-\s+)?uses:\s*(.+)$/gm;

/** Marketplace actions must pin a 40-character commit SHA after `@`. */
const PINNED_ACTION_REF_RE = /^.+@[0-9a-f]{40}(\s+#.*)?$/;

export function normalizeUsesTarget(raw: string): string {
  let target = raw.trim();
  const commentIndex = target.indexOf(" #");
  if (commentIndex !== -1) {
    target = target.slice(0, commentIndex).trim();
  }
  if (
    (target.startsWith('"') && target.endsWith('"')) ||
    (target.startsWith("'") && target.endsWith("'"))
  ) {
    target = target.slice(1, -1);
  }
  return target.trim();
}

export function collectActionUses(text: string): string[] {
  const uses: string[] = [];
  for (const match of text.matchAll(USES_RE)) {
    uses.push(normalizeUsesTarget(match[1]));
  }
  return uses;
}

export function isLocalActionRef(target: string): boolean {
  return target.startsWith("./") || target.startsWith("../");
}

export function findLocalActionUses(text: string): string[] {
  return collectActionUses(text).filter(isLocalActionRef);
}

export function findUnpinnedActionUses(text: string): string[] {
  return collectActionUses(text).filter((target) => {
    if (isLocalActionRef(target)) {
      return false;
    }
    return !PINNED_ACTION_REF_RE.test(target);
  });
}

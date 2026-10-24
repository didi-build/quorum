export function addSourcesButtonLabel(count: number): string {
  if (count <= 0) {
    return "Add sources";
  }
  if (count === 1) {
    return "Add 1 source";
  }
  return `Add ${count} sources`;
}

export function addedSourcesToast(count: number): string {
  if (count === 1) {
    return "Added 1 source. Indexing has started.";
  }
  return `Added ${count} sources. Indexing has started.`;
}

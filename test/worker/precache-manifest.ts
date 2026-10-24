export function parsePrecacheRelativeUrls(swSource: string): string[] {
  const urls = new Set<string>();
  const re = /url:"([^"]+)"/g;
  for (let match = re.exec(swSource); match; match = re.exec(swSource)) {
    urls.add(match[1]);
  }
  return [...urls];
}

export function precacheUrlToFetchPath(relativeUrl: string): string {
  const normalized = relativeUrl.replace(/^\//, "");
  return `/app/${normalized}`;
}

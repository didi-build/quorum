/** Removes legacy API key storage from older builds. */
export function clearLegacyApiKeyStorage(): void {
  localStorage.removeItem("domain.api_key");
  localStorage.removeItem("quorum.api_key");
}

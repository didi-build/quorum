export const AUTH_FETCH_TIMEOUT_MS = 15_000;

export function authRequestFailedError(): Error {
  return new Error("Something went wrong on our side. Try again in a moment.");
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs = AUTH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    throw authRequestFailedError();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readAuthJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    throw authRequestFailedError();
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw authRequestFailedError();
  }
}

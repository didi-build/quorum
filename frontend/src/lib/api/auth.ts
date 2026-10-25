import { authFetch, readAuthJson } from "./auth-http";

export interface AuthUser {
  login: string;
  github_id: number;
}

export interface AccessDeniedInfo {
  login: string;
}

export interface AuthApi {
  fetchAuthUser(): Promise<AuthUser | null>;
  fetchAccessDeniedInfo(): Promise<AccessDeniedInfo | null>;
  logout(): Promise<void>;
}

export const authFixtures = {
  user: { login: "diadem", github_id: 42 } satisfies AuthUser,
  accessDenied: { login: "sam-rivera" } satisfies AccessDeniedInfo,
};

const jsonHeaders = { Accept: "application/json" };

async function fetchAuthUserLive(): Promise<AuthUser | null> {
  const response = await authFetch("/auth/me", {
    credentials: "include",
    headers: jsonHeaders,
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
  return readAuthJson<AuthUser>(response);
}

async function fetchAccessDeniedInfoLive(): Promise<AccessDeniedInfo | null> {
  const response = await authFetch("/auth/access-denied", {
    credentials: "include",
    headers: jsonHeaders,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
  return readAuthJson<AccessDeniedInfo>(response);
}

async function logoutLive(): Promise<void> {
  const response = await authFetch("/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok && response.status !== 204) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
}

const liveAuthApi: AuthApi = {
  fetchAuthUser: fetchAuthUserLive,
  fetchAccessDeniedInfo: fetchAccessDeniedInfoLive,
  logout: logoutLive,
};

let resolvedAuthApi: AuthApi | null = null;

async function resolveAuthApi(): Promise<AuthApi> {
  if (resolvedAuthApi) {
    return resolvedAuthApi;
  }
  if (import.meta.env.DEV && import.meta.env.VITE_AUTH_MOCK === "true") {
    const { createMockAuthApi } = await import("./auth.mock");
    resolvedAuthApi = createMockAuthApi();
    return resolvedAuthApi;
  }
  resolvedAuthApi = liveAuthApi;
  return resolvedAuthApi;
}

export function createAuthApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return { ...liveAuthApi, ...overrides };
}

export async function fetchAuthUser(): Promise<AuthUser | null> {
  if (import.meta.env.MODE === "mock-preview") {
    const { loadMockPreviewAuthUser } = await import("../preview/loadPreviewMocks");
    return loadMockPreviewAuthUser();
  }
  const api = await resolveAuthApi();
  return api.fetchAuthUser();
}

export async function fetchAccessDeniedInfo(): Promise<AccessDeniedInfo | null> {
  const api = await resolveAuthApi();
  return api.fetchAccessDeniedInfo();
}

export async function logout(): Promise<void> {
  const api = await resolveAuthApi();
  return api.logout();
}

/** @internal Reset cached API (tests only). */
export function resetAuthApiCache(): void {
  resolvedAuthApi = null;
}

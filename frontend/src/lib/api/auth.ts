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

function authMockMode(): boolean {
  return import.meta.env.VITE_AUTH_MOCK === "true";
}

async function fetchAuthUserLive(): Promise<AuthUser | null> {
  const response = await fetch("/auth/me", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
  return (await response.json()) as AuthUser;
}

async function fetchAccessDeniedInfoLive(): Promise<AccessDeniedInfo | null> {
  const response = await fetch("/auth/access-denied", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
  return (await response.json()) as AccessDeniedInfo;
}

async function logoutLive(): Promise<void> {
  const response = await fetch("/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok && response.status !== 204) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
}

function mockAuthUserFromEnv(): AuthUser | null {
  const raw = import.meta.env.VITE_AUTH_MOCK_USER;
  if (!raw) {
    return null;
  }
  const login = raw.replace(/^@/, "");
  return { login, github_id: 0 };
}

const mockAuthApi: AuthApi = {
  async fetchAuthUser() {
    return mockAuthUserFromEnv();
  },
  async fetchAccessDeniedInfo() {
    const login = import.meta.env.VITE_AUTH_MOCK_ACCESS_DENIED;
    if (!login) {
      return null;
    }
    return { login: login.replace(/^@/, "") };
  },
  async logout() {
    return;
  },
};

const liveAuthApi: AuthApi = {
  fetchAuthUser: fetchAuthUserLive,
  fetchAccessDeniedInfo: fetchAccessDeniedInfoLive,
  logout: logoutLive,
};

export function createAuthApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return { ...liveAuthApi, ...overrides };
}

export const authApi: AuthApi = authMockMode() ? mockAuthApi : liveAuthApi;

export async function fetchAuthUser(): Promise<AuthUser | null> {
  return authApi.fetchAuthUser();
}

export async function fetchAccessDeniedInfo(): Promise<AccessDeniedInfo | null> {
  return authApi.fetchAccessDeniedInfo();
}

export async function logout(): Promise<void> {
  return authApi.logout();
}

import type { AuthApi } from "./auth";

function mockAuthUserFromEnv(): { login: string; github_id: number } | null {
  const raw = import.meta.env.VITE_AUTH_MOCK_USER;
  if (!raw) {
    return null;
  }
  const login = raw.replace(/^@/, "");
  return { login, github_id: 0 };
}

export function createMockAuthApi(): AuthApi {
  return {
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
}

export interface AuthUser {
  login: string;
  github_id: number;
}

export interface AccessDeniedInfo {
  login: string;
}

export async function fetchAuthUser(): Promise<AuthUser | null> {
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

export async function fetchAccessDeniedInfo(): Promise<AccessDeniedInfo | null> {
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

export async function logout(): Promise<void> {
  const response = await fetch("/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok && response.status !== 204) {
    throw new Error("Something went wrong on our side. Try again in a moment.");
  }
}

export function githubLoginUrl(): string {
  return "/auth/github/login";
}

export function landingPageUrl(): string {
  return "/";
}

export function requestAccessMailto(login: string): string {
  const subject = encodeURIComponent("Quorum access request");
  const body = encodeURIComponent(`GitHub username: @${login}`);
  return `mailto:hello@didi.build?subject=${subject}&body=${body}`;
}

export function githubLogoutUrl(): string {
  return "https://github.com/logout";
}

export function initialsFromLogin(login: string): string {
  const parts = login.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return login.slice(0, 2).toUpperCase();
}

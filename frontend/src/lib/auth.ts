export type { AccessDeniedInfo, AuthUser } from "./api/auth";
export { fetchAccessDeniedInfo, fetchAuthUser, logout } from "./api/auth";

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

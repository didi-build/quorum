import { ConfigError } from "./errors.js";

export function optionalEnvString(
  env: Record<string, unknown>,
  name: string,
): string | undefined {
  const raw = env[name];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string") {
    return String(raw);
  }
  return raw;
}

export function envString(
  env: Record<string, unknown>,
  name: string,
  defaultValue: string,
): string {
  const value = optionalEnvString(env, name);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value;
}

/** Returns a non-empty string or throws {@link ConfigError} naming the variable. */
export function requireEnvString(env: Record<string, unknown>, name: string): string {
  const value = optionalEnvString(env, name);
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(name);
  }
  return value;
}

export function envInt(
  env: Record<string, unknown>,
  name: string,
  defaultValue: number,
): number {
  const raw = optionalEnvString(env, name);
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new ConfigError(name);
  }
  return parsed;
}

export function envFloat(
  env: Record<string, unknown>,
  name: string,
  defaultValue: number,
): number {
  const raw = optionalEnvString(env, name);
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new ConfigError(name);
  }
  return parsed;
}

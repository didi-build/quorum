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
  return value.trim();
}

const STRICT_INT_PATTERN = /^-?\d+$/;
const STRICT_FLOAT_PATTERN = /^-?\d+(\.\d+)?$/;

export function envInt(
  env: Record<string, unknown>,
  name: string,
  defaultValue: number,
): number {
  const raw = optionalEnvString(env, name);
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const trimmed = raw.trim();
  if (!STRICT_INT_PATTERN.test(trimmed)) {
    throw ConfigError.invalid(name);
  }
  return Number.parseInt(trimmed, 10);
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
  const trimmed = raw.trim();
  if (!STRICT_FLOAT_PATTERN.test(trimmed)) {
    throw ConfigError.invalid(name);
  }
  return Number.parseFloat(trimmed);
}

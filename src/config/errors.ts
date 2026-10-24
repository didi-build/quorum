/** Thrown when a required Worker env var or secret is missing, empty, or invalid. */
export class ConfigError extends Error {
  readonly variableName: string;
  readonly reason: "missing" | "invalid";

  constructor(variableName: string, reason: "missing" | "invalid" = "missing") {
    const message =
      reason === "missing"
        ? `Missing required environment variable: ${variableName}`
        : `Invalid environment variable: ${variableName}`;
    super(message);
    this.name = "ConfigError";
    this.variableName = variableName;
    this.reason = reason;
  }

  static invalid(variableName: string): ConfigError {
    return new ConfigError(variableName, "invalid");
  }
}

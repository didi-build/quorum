/** Thrown when a required Worker env var or secret is missing or empty. */
export class ConfigError extends Error {
  readonly variableName: string;

  constructor(variableName: string) {
    super(`Missing required environment variable: ${variableName}`);
    this.name = "ConfigError";
    this.variableName = variableName;
  }
}

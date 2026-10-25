import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/config/errors.js";
import { jsonDetail, workerErrorResponse } from "../src/http/api-error.js";

describe("API error shape (FastAPI parity)", () => {
  it("serializes { detail } for jsonDetail", async () => {
    const response = jsonDetail("Not authenticated", 401);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Not authenticated" });
  });

  it("maps ConfigError to JSON without leaking stack fields", async () => {
    const response = workerErrorResponse(new ConfigError("ANTHROPIC_API_KEY"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      detail: "Missing required environment variable: ANTHROPIC_API_KEY",
    });
    expect(body).not.toHaveProperty("stack");
  });

  it("returns generic internal error for unexpected failures", async () => {
    const response = workerErrorResponse(new Error("database driver exploded"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ detail: "Internal Server Error" });
  });
});

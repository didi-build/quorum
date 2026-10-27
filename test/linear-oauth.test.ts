import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import { linearAuthorizeUrl } from "../src/domain/oauth/linear.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

describe("linear OAuth authorize URL (unit)", () => {
  const config = loadConfig(
    withTestConfigEnv({
      LINEAR_CLIENT_ID: "test-linear-client-id",
      LINEAR_REDIRECT_URI: "http://localhost:8787/oauth/linear/callback",
      LINEAR_SCOPES: "read write",
    }),
  );

  it("includes actor=app", () => {
    const url = linearAuthorizeUrl(config, "test-state-token");
    const query = new URL(url).searchParams;
    expect(query.get("actor")).toBe("app");
  });

  it("preserves signed state", () => {
    const state = "signed-state-from-create_oauth_state";
    const url = linearAuthorizeUrl(config, state);
    const query = new URL(url).searchParams;
    expect(query.get("state")).toBe(state);
    expect(query.get("scope")).toBe("read write");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import {
  clearInstallationTokenCache,
  createAppJwt,
  createInstallationAccessToken,
  getInstallationAccessToken,
} from "../src/domain/oauth/github-app.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";
import { generateTestPrivateKeyBase64 } from "./fixtures/github-app-test-key.js";

describe("github-app (unit)", () => {
  afterEach(() => {
    clearInstallationTokenCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("createAppJwt produces a three-segment token", async () => {
    const privateKeyBase64 = await generateTestPrivateKeyBase64();
    const config = loadConfig(
      withTestConfigEnv({
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
      }),
    );
    const token = await createAppJwt(config);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  it("getInstallationAccessToken uses cache", async () => {
    clearInstallationTokenCache();
    const privateKeyBase64 = await generateTestPrivateKeyBase64();
    const config = loadConfig(
      withTestConfigEnv({
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
      }),
    );
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: "cached-token", expires_at: expiresAt }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await getInstallationAccessToken(config, "999");
    const second = await getInstallationAccessToken(config, "999");

    expect(first).toBe("cached-token");
    expect(second).toBe("cached-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createInstallationAccessToken surfaces GitHub HTTP errors", async () => {
    const privateKeyBase64 = await generateTestPrivateKeyBase64();
    const config = loadConfig(
      withTestConfigEnv({
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );

    await expect(
      createInstallationAccessToken(config, "installation-1"),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

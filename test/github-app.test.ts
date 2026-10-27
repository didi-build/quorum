import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import {
  clearInstallationTokenCache,
  createAppJwt,
  createInstallationAccessToken,
  getInstallationAccessToken,
  isGithubAppConfigured,
} from "../src/domain/oauth/github-app.js";
import type { QuorumConfig } from "../src/config/types.js";
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
    expect(token).not.toContain(privateKeyBase64);
  });

  it("imports GitHub App PKCS#8 key as non-extractable (WebCrypto)", async () => {
    const privateKeyBase64 = await generateTestPrivateKeyBase64();
    const binary = atob(privateKeyBase64);
    const pkcs8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pkcs8[i] = binary.charCodeAt(i);
    }
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("pkcs8", key)).rejects.toThrow();
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

  it("isGithubAppConfigured requires private key base64", () => {
    const base = loadConfig(
      withTestConfigEnv({
        GITHUB_APP_ID: "123456",
        GITHUB_APP_SLUG: "quorum-test-app",
      }),
    );
    const configured: QuorumConfig = {
      ...base,
      githubAppId: "123456",
      githubAppSlug: "quorum-test-app",
      githubAppPrivateKeyBase64: "dGVzdA==",
    };
    const missingKey: QuorumConfig = {
      ...configured,
      githubAppPrivateKeyBase64: "",
    };
    expect(isGithubAppConfigured(configured)).toBe(true);
    expect(isGithubAppConfigured(missingKey)).toBe(false);
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

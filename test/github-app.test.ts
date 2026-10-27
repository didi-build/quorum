import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import type { QuorumConfig } from "../src/config/types.js";
import {
  clearInstallationTokenCache,
  createAppJwt,
  createInstallationAccessToken,
  fetchInstallation,
  getInstallationAccessToken,
  GithubAppPrivateKeyFormatError,
  GITHUB_APP_INSTALLATION_ID_INVALID_DETAIL,
  GITHUB_APP_PRIVATE_KEY_PEM_REJECTED_MESSAGE,
  importSigningKey,
  isGithubAppConfigured,
} from "../src/domain/oauth/github-app.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";
import { generateTestPrivateKeyBase64 } from "./fixtures/github-app-test-key.js";

function base64UrlEncodeJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

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

  it("importSigningKey accepts PKCS#8 DER base64 and signs a verifiable JWT", async () => {
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;

    const pkcs8Der = (await crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey,
    )) as ArrayBuffer;
    const derBytes = new Uint8Array(pkcs8Der);
    let binary = "";
    for (const byte of derBytes) {
      binary += String.fromCharCode(byte);
    }
    const privateKeyBase64 = btoa(binary);

    const signingKey = await importSigningKey(privateKeyBase64);
    const appId = "123456";
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncodeJson({ alg: "RS256", typ: "JWT" });
    const payload = base64UrlEncodeJson({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    });
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signingKey,
      new TextEncoder().encode(signingInput),
    );
    let sigBinary = "";
    for (const byte of new Uint8Array(signature)) {
      sigBinary += String.fromCharCode(byte);
    }
    const signatureEncoded = btoa(sigBinary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const token = `${signingInput}.${signatureEncoded}`;

    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keyPair.publicKey,
      sigBytes,
      data,
    );
    expect(valid).toBe(true);
  });

  it("importSigningKey rejects base64-encoded PEM with a fixed error", async () => {
    const pemText =
      atob("LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0K") +
      "placeholder\n" +
      atob("LS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo");
    const pemBase64 = btoa(pemText);

    let caught: unknown;
    try {
      await importSigningKey(pemBase64);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GithubAppPrivateKeyFormatError);
    expect((caught as Error).message).toBe(GITHUB_APP_PRIVATE_KEY_PEM_REJECTED_MESSAGE);
    expect((caught as Error).message).not.toContain("placeholder");
    expect((caught as Error).message).not.toContain(
      atob("LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0K").trim(),
    );
  });

  it("importSigningKey imports GitHub App PKCS#8 DER as non-extractable", async () => {
    const privateKeyBase64 = await generateTestPrivateKeyBase64();
    const key = await importSigningKey(privateKeyBase64);
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

    await expect(createInstallationAccessToken(config, "42")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("fetchInstallation and createInstallationAccessToken reject invalid installation IDs before fetch", async () => {
    const privateKeyBase64 = await generateTestPrivateKeyBase64();
    const config = loadConfig(
      withTestConfigEnv({
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invalidIds = ["", "0", "01", "abc", "1/../../hook/config", "1?x=1"];

    for (const installationId of invalidIds) {
      await expect(fetchInstallation(config, installationId)).rejects.toMatchObject({
        name: "GithubAppInstallationIdError",
        message: GITHUB_APP_INSTALLATION_ID_INVALID_DETAIL,
      });
      await expect(
        createInstallationAccessToken(config, installationId),
      ).rejects.toMatchObject({
        name: "GithubAppInstallationIdError",
        message: GITHUB_APP_INSTALLATION_ID_INVALID_DETAIL,
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { isAppSpaPath, shouldServeAppShell } from "../../src/index";

describe("SPA fallback routing", () => {
  it("matches only /app and /app/... paths", () => {
    expect(isAppSpaPath("/app")).toBe(true);
    expect(isAppSpaPath("/app/")).toBe(true);
    expect(isAppSpaPath("/app/connections")).toBe(true);
    expect(isAppSpaPath("/application")).toBe(false);
    expect(isAppSpaPath("/")).toBe(false);
  });

  it("requires text/html Accept for shell fallback", () => {
    const url = new URL("http://example.com/app/missing");
    const asset404 = new Response(null, { status: 404 });

    expect(
      shouldServeAppShell(
        url,
        new Request(url, { headers: { Accept: "text/html" } }),
        asset404,
      ),
    ).toBe(true);

    expect(
      shouldServeAppShell(
        url,
        new Request(url, { headers: { Accept: "*/*" } }),
        asset404,
      ),
    ).toBe(false);

    expect(shouldServeAppShell(url, new Request(url), asset404)).toBe(false);

    expect(
      shouldServeAppShell(
        url,
        new Request(url, { method: "POST", headers: { Accept: "text/html" } }),
        asset404,
      ),
    ).toBe(false);
  });
});

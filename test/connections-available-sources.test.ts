import { describe, expect, it } from "vitest";
import {
  mapLinearGraphqlErrors,
  mapLinearHttpStatus,
  LINEAR_ACCESS_LOST_DETAIL,
  PROVIDER_RATE_LIMIT_DETAIL,
  PROVIDER_ERROR_DETAIL,
} from "../src/domain/connections/available-sources.js";

describe("Linear available sources error mapping (unit)", () => {
  it("maps 401 and 403 to reconnect copy", () => {
    expect(mapLinearHttpStatus(401).detail).toBe(LINEAR_ACCESS_LOST_DETAIL);
    expect(mapLinearHttpStatus(403).statusCode).toBe(403);
  });

  it("maps 429 to rate limit copy", () => {
    expect(mapLinearHttpStatus(429).detail).toBe(PROVIDER_RATE_LIMIT_DETAIL);
  });

  it("maps other HTTP errors to 502", () => {
    expect(mapLinearHttpStatus(500).statusCode).toBe(502);
    expect(mapLinearHttpStatus(500).detail).toBe(PROVIDER_ERROR_DETAIL);
  });

  it("maps GraphQL auth errors to reconnect copy", () => {
    const error = mapLinearGraphqlErrors([{ extensions: { code: "JWT_EXPIRED" } }]);
    expect(error.statusCode).toBe(403);
    expect(error.detail).toBe(LINEAR_ACCESS_LOST_DETAIL);
  });
});

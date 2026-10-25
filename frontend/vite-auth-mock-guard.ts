import type { Plugin } from "vite";

export function quorumAuthMockGuard(): Plugin {
  return {
    name: "quorum-auth-mock-guard",
    config(_config, { mode }) {
      if (mode === "production" && process.env.VITE_AUTH_MOCK) {
        throw new Error(
          "VITE_AUTH_MOCK must not be set for production builds. Unset it before running vite build.",
        );
      }
    },
  };
}

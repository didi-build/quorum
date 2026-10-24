export interface SourcesEnv {
  DEV: boolean;
  PROD: boolean;
  VITE_SOURCES_MOCK?: string;
}

/** Whether the dev-only mock backend should load (never in production). */
export function resolveSourcesMockMode(env: SourcesEnv): "mock" | "http" {
  if (env.PROD) {
    return "http";
  }
  if (env.VITE_SOURCES_MOCK === "false") {
    return "http";
  }
  if (env.DEV) {
    return "mock";
  }
  return "http";
}

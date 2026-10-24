/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_SOURCES_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

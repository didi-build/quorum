/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_SOURCES_MOCK?: string;
  readonly VITE_AUTH_MOCK?: string;
  readonly VITE_AUTH_MOCK_USER?: string;
  readonly VITE_AUTH_MOCK_ACCESS_DENIED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

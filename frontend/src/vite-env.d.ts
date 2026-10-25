/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  /** Dev only: set to "false" to use live chat endpoints while developing. */
  readonly VITE_CHAT_MOCK?: string;
  readonly VITE_SOURCES_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

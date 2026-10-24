/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  /** Dev only: set to "false" to use live chat endpoints while developing. */
  readonly VITE_CHAT_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

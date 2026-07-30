/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DELIVERY_URL?: string;
  readonly VITE_PROCESSING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

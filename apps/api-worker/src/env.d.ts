declare global {
  interface Env {
    IMAGERYX_API_KEY: string;
    DOWNLOAD_SIGNING_SECRET: string;
    // Secrets, so absent from the wrangler-generated worker-configuration.d.ts
    // (vars and secrets share one binding namespace; see
    // apps/processing-worker/wrangler.jsonc). Optional because this Worker
    // never transforms anything — it only *reports* whether Cloudinary is
    // configured, via /v1/diagnostics/providers.
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
  }

  namespace Cloudflare {
    interface Env {
      IMAGERYX_API_KEY: string;
      DOWNLOAD_SIGNING_SECRET: string;
      CLOUDINARY_CLOUD_NAME?: string;
      CLOUDINARY_API_KEY?: string;
      CLOUDINARY_API_SECRET?: string;
    }
  }
}

export {};

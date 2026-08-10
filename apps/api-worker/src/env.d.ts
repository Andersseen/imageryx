declare global {
  interface Env {
    IMAGERYX_API_KEY: string;
    DOWNLOAD_SIGNING_SECRET: string;
  }

  namespace Cloudflare {
    interface Env {
      IMAGERYX_API_KEY: string;
      DOWNLOAD_SIGNING_SECRET: string;
    }
  }
}

export {};

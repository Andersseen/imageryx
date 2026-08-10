declare global {
  interface Env {
    DOWNLOAD_SIGNING_SECRET: string;
  }

  namespace Cloudflare {
    interface Env {
      DOWNLOAD_SIGNING_SECRET: string;
    }
  }
}

export {};

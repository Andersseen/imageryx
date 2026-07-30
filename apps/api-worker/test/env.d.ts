/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

// `cloudflare:test`'s `env` export is typed as `Cloudflare.Env` (see
// worker-configuration.d.ts), not `ProvidedEnv` — augment it directly so
// `env.TEST_MIGRATIONS` typechecks in test/apply-migrations.ts. Wrapped in
// `declare global`: the top-level `import` above makes this file a module,
// so a bare `declare namespace Cloudflare` would otherwise create a
// module-local namespace instead of merging with the ambient global one.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

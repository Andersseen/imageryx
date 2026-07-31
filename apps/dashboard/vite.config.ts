import analog from "@analogjs/platform";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, transformWithEsbuild, type Plugin } from "vite";

/**
 * @analogjs/vite-plugin-angular's compiler processes every .ts file it sees, including
 * workspace packages resolved through pnpm's symlinks (e.g. @imageryx/sdk, @imageryx/angular).
 * For pure re-export barrel files with no Angular decorators, it emits EMPTY content during a
 * production build — Rollup then sees zero import/export statements in that file and silently
 * drops the whole subgraph (reproduced with @imageryx/sdk's and @imageryx/angular's
 * src/index.ts: `vite build` failed with "createImageryxClient is not exported by
 * .../sdk/src/index.ts" even though the export is plainly there). `transformFilter` below tells
 * the Angular plugin to skip every file under packages/**, and this plugin (enforce: "pre", so
 * it runs first) gives those files the same plain esbuild transform Vite would apply by default
 * if the Angular plugin weren't intercepting all .ts files.
 */
const workspacePackageTsPlugin: Plugin = {
  name: "workspace-package-ts-transform",
  enforce: "pre",
  async transform(code, id) {
    if (!id.includes("/packages/") || !id.endsWith(".ts")) return null;
    return transformWithEsbuild(code, id, { loader: "ts", target: "es2022" });
  },
};

export default defineConfig({
  build: {
    target: ["es2022"],
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 5173,
  },
  plugins: [
    workspacePackageTsPlugin,
    analog({
      ssr: false,
      // Analog's dev-server middleware forwards this whole prefix to the Nitro server (see
      // `src/server/routes/proxy/[...path].ts`). Deliberately not the "api" default: that
      // would collide with `/api`, this dashboard's own API-reference *page* route — a direct
      // load or refresh of `/api` would be swallowed by Nitro's dev middleware before the SPA
      // ever got to render it.
      apiPrefix: "proxy",
      prerender: {
        routes: [],
      },
      vite: {
        transformFilter: (_code, id) => !id.includes("/packages/"),
      },
    }),
    tailwindcss(),
  ],
});

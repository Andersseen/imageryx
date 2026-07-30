# @imageryx/typescript-config

Shared, strict TypeScript base configurations for every app and package in the Imageryx monorepo.

## Configs

| File | Use for |
| --- | --- |
| `base.json` | Shared strict compiler defaults (all configs extend this) |
| `node.json` | Plain Node.js packages and tooling scripts |
| `worker.json` | Cloudflare Workers (adds `@cloudflare/workers-types`) |
| `angular-app.json` | Angular applications (Analog dashboard) |
| `angular-lib.json` | Angular libraries that emit declarations |

## Usage

```jsonc
{
  "extends": "@imageryx/typescript-config/worker.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

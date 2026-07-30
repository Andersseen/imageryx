# @imageryx/eslint-config

Shared ESLint 9 flat configs for the Imageryx monorepo.

## Usage

Plain TypeScript package (Worker, Node tooling, library stub):

```js
// eslint.config.js
import base from "@imageryx/eslint-config/base";

export default base;
```

Angular app or library:

```js
// eslint.config.js
import { withAngular } from "@imageryx/eslint-config/angular";

export default withAngular("ix");
```

The `prefix` argument enforces the Angular component/directive selector prefix (e.g. `ix-sidebar`).

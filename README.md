# devtools

Shared ESLint, Prettier, and Knip configuration for modern TypeScript projects.

## What you get

- Consistent linting across repos
- Zero-config Prettier setup
- Shared Knip static-analysis defaults
- Bundled tool binaries for ESLint, Prettier, and Knip
- Strict TypeScript rules without compromise
- One source of truth for tooling

## Features

- Flat ESLint config (latest standard)
- Preconfigured plugin ecosystem
- Prettier integration
- Shared Knip config factories
- `ankhorage-eslint`, `ankhorage-prettier`, and `ankhorage-knip` binaries
- Monorepo-friendly

## Installation

```bash
bun add -D @ankhorage/devtools
```

The package owns the ESLint, Prettier, and Knip toolchain. Consuming repos should not install `eslint`, `prettier`, or `knip` directly unless they intentionally need a different version from the shared Ankhorage toolchain.

## Usage

### Scripts

Use the devtools-owned binaries in package scripts:

```json
{
  "scripts": {
    "lint": "ankhorage-eslint . --max-warnings=0",
    "lint:fix": "ankhorage-eslint . --fix --max-warnings=0",
    "format": "ankhorage-prettier --write .",
    "format:check": "ankhorage-prettier --check .",
    "knip": "ankhorage-knip"
  }
}
```

### ESLint

Create an `eslint.config.js` file:

```js
import { createConfig } from '@ankhorage/devtools/eslint';

export default createConfig({
  files: ['src/**/*.{ts,tsx}'],
  project: ['./tsconfig.json'],
  tsconfigRootDir: import.meta.dirname,
});
```

### Prettier

Create a Prettier config file:

```js
export { default } from '@ankhorage/devtools/prettier';
```

CommonJS repos can use:

```js
module.exports = require('@ankhorage/devtools/prettier');
```

### Knip

Create a repo-local `knip.config.ts` file:

```ts
import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig();
```

Repos can add narrow repo-specific patterns when needed:

```ts
import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  entry: ['scripts/release.ts'],
  project: ['scripts/**/*.ts'],
  ignore: ['fixtures/**'],
  ignoreBinaries: ['custom-tool'],
  ignoreFiles: ['examples/fixture.ts'],
});
```

For workspaces-based monorepos, use the monorepo preset:

```ts
import { createKnipMonorepoConfig } from '@ankhorage/devtools/knip';

export default createKnipMonorepoConfig({
  root: {
    ignoreFiles: ['.prettierrc.js', 'eslint.config.js'],
  },
});
```

By default, the monorepo preset configures Knip workspaces for the root package, `packages/*`, and `apps/*`. Repos can override those defaults or add extra workspace globs:

```ts
import { createKnipMonorepoConfig } from '@ankhorage/devtools/knip';

export default createKnipMonorepoConfig({
  workspaceGlobs: ['packages/*', 'apps/*', 'examples/*'],
  workspaceDefaults: {
    ignoreFiles: ['fixtures/**'],
  },
  workspaces: {
    '.': {
      ignoreFiles: ['.prettierrc.js', 'eslint.config.js'],
    },
    'apps/editor': {
      ignoreFiles: ['babel.config.js'],
      ignoreDependencies: ['babel-preset-expo'],
    },
  },
});
```

The shared config intentionally keeps defaults narrow so Knip can still report real unused files, exports, dependencies, and binaries. Prefer explicit `entry`, `project`, `ignoreBinaries`, `ignoreDependencies`, or `ignoreFiles` over broad ignores.

### CI

Run the scripts in CI after dependencies are installed:

```yaml
- name: Run lint
  run: bun run lint

- name: Run format check
  run: bun run format:check

- name: Run Knip
  run: bun run knip
```

For workflows that support optional scripts, use the same guard style as the other devtools checks:

```yaml
- name: Run Knip
  run: |
    if node -e "const p=require('./package.json'); process.exit(p.scripts?.knip ? 0 : 1)"; then
      bun run knip
    else
      echo "No knip script found; skipping."
    fi
```

## Use Cases

- Monorepos with shared standards
- Teams that want strict, predictable linting
- Projects avoiding duplicated config
- Repos that need consistent unused-file, unused-export, and dependency checks

## Why this exists

Maintaining ESLint, Prettier, and Knip configs across multiple repositories leads to:

- duplication
- inconsistency
- drift over time

This package centralizes tooling so all projects stay aligned.

## Scope

Includes:

- ESLint configuration and binary wrapper
- Prettier configuration and binary wrapper
- Knip configuration and binary wrapper

Excludes:

- runtime code
- build tooling

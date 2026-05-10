# devtools

Shared ESLint, Prettier, and Knip configuration for modern TypeScript projects.

## What you get

- Consistent linting across repos
- Zero-config Prettier setup
- Shared Knip static-analysis defaults
- Strict TypeScript rules without compromise
- One source of truth for tooling

## Features

- Flat ESLint config (latest standard)
- Preconfigured plugin ecosystem
- Prettier integration
- Shared Knip config factory
- Monorepo-friendly

## Installation

```bash
bun add -D @ankhorage/devtools
```

Install the tools used by your local scripts as development dependencies:

```bash
bun add -D eslint prettier knip
```

## Usage

### ESLint

```js
import config from '@ankhorage/devtools/eslint';

export default config();
```

### Prettier

```json
{
  "extends": "@ankhorage/devtools/prettier"
}
```

### Knip

Create a repo-local `knip.config.ts` file:

```ts
import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig();
```

Add a package script:

```json
{
  "scripts": {
    "knip": "knip"
  }
}
```

Repos can append narrow repo-specific patterns without replacing the shared defaults:

```ts
import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  entry: ['scripts/release.ts'],
  project: ['scripts/**/*.ts'],
  ignore: ['fixtures/**'],
});
```

Prefer explicit `entry`, `project`, or Knip plugin configuration over broad ignores when tool config files are reported as unused.

### CI

Run Knip in CI after dependencies are installed:

```yaml
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

- ESLint configuration
- Prettier configuration
- Knip configuration

Excludes:

- runtime code
- build tooling

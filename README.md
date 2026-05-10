# devtools

Shared ESLint and Prettier configuration for modern TypeScript projects.

## What you get

- Consistent linting across repos
- Zero-config Prettier setup
- Strict TypeScript rules without compromise
- One source of truth for tooling

## Features

- Flat ESLint config (latest standard)
- Preconfigured plugin ecosystem
- Prettier integration
- Monorepo-friendly

## Installation

```bash
bun add -D @ankhorage/devtools
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

## Use Cases

- Monorepos with shared standards
- Teams that want strict, predictable linting
- Projects avoiding duplicated config

## Why this exists

Maintaining ESLint + Prettier configs across multiple repositories leads to:

- duplication
- inconsistency
- drift over time

This package centralizes tooling so all projects stay aligned.

## Scope

Includes:

- ESLint configuration
- Prettier configuration

Excludes:

- runtime code
- build tooling

# devtools

Shared ESLint, Prettier, and workflow configuration for modern TypeScript projects.

## What you get

- Consistent linting across repos
- Zero-config Prettier setup
- Canonical GitHub workflow templates
- Strict TypeScript rules without compromise
- One source of truth for tooling

## Features

- Flat ESLint config
- Preconfigured plugin ecosystem
- Prettier integration
- Shared CI and release workflow templates
- Monorepo-friendly defaults

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

### GitHub workflow templates

`@ankhorage/devtools` publishes canonical workflow templates:

```text
@ankhorage/devtools/workflows/ci.yml
@ankhorage/devtools/workflows/release.yml
```

They are also present in the published package under:

```text
workflows/ci.yml
workflows/release.yml
```

Copy them into consuming repositories as:

```text
.github/workflows/ci.yml
.github/workflows/release.yml
```

The current workflow baseline uses:

- Bun `1.3.13`
- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run test`
- `bun run typecheck`
- Changesets release automation for published packages

Every reachable `ankhorage/*` repository should use the full shared devtools baseline that applies to that repo. Legitimate app-vs-package exceptions should be documented in the relevant PR rather than hidden through legacy workflow branches.

## Use Cases

- Monorepos with shared standards
- Teams that want strict, predictable linting
- Projects avoiding duplicated config
- Package repos that need consistent CI and release workflows

## Why this exists

Maintaining ESLint, Prettier, and workflow configs across multiple repositories leads to:

- duplication
- inconsistency
- drift over time

This package centralizes tooling so all projects stay aligned.

## Scope

Includes:

- ESLint configuration
- Prettier configuration
- GitHub workflow templates

Excludes:

- runtime code
- project build tooling
- workflow installation automation

Workflow installation will be automated by a future Orchestrator module.

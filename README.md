# devtools

Shared development tools and repository standards for Ankhorage TypeScript projects.

## What it owns

`@ankhorage/devtools` is the single source of truth for these equal, separate concerns:

```text
src/
├── cli/
└── tools/
    ├── eslint/
    ├── prettier/
    ├── knip/
    ├── workflows/
    └── vscode/
```

- `eslint`: shared flat ESLint configuration and the bundled ESLint runner
- `prettier`: shared Prettier configuration and the bundled Prettier runner
- `knip`: shared Knip configuration and the bundled Knip runner
- `workflows`: canonical `.github/workflows/ci.yml` and `release.yml`
- `vscode`: canonical `.vscode/settings.json` and `extensions.json`

There is no generic template layer around these concerns. Each tool owns its canonical files and behavior.

## Installation

```bash
bun add -D @ankhorage/devtools
```

The package owns the ESLint, Prettier, and Knip versions used by consuming repositories. Do not install those tools directly unless a repository intentionally opts out of the shared Ankhorage toolchain.

## Ankh provider

The package is discovered under the `devtools` category and exposes these capabilities:

- `devtools.lint`
- `devtools.format`
- `devtools.knip`
- `devtools.sync`
- `devtools.status`
- `devtools.workflows.sync`
- `devtools.workflows.status`
- `devtools.vscode.sync`
- `devtools.vscode.status`

The canonical command prefix is always:

```bash
ankh devtools ...
```

## Tool commands

```bash
ankh devtools lint -- --max-warnings=0 .
ankh devtools format -- --check .
ankh devtools knip -- --production
```

These commands delegate to the same bundled tools as the package binaries:

- `ankh devtools lint` → `ankhorage-eslint`
- `ankh devtools format` → `ankhorage-prettier`
- `ankh devtools knip` → `ankhorage-knip`

Recommended package scripts:

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

## Repository synchronization

### Synchronize all managed files

```bash
ankh devtools sync .
```

The target path is optional and defaults to the current working directory:

```bash
ankh devtools sync
```

### Report drift without changing files

```bash
ankh devtools status .
```

`status` exits with code `1` when any managed file is missing or outdated. It exits with code `0` when all managed files are current.

Example output:

```text
✓ .github/workflows/ci.yml
✗ .github/workflows/release.yml outdated
+ .vscode/settings.json missing
✓ .vscode/extensions.json
```

### Synchronize one concern

```bash
ankh devtools workflows sync .
ankh devtools vscode sync .
```

### Report one concern

```bash
ankh devtools workflows status .
ankh devtools vscode status .
```

### Preview synchronization

```bash
ankh devtools sync . --dry-run
ankh devtools workflows sync . --dry-run
ankh devtools vscode sync . --dry-run
```

A dry run reports `would create` and `would update` actions without writing any files.

## Synchronization guarantees

Synchronization is deterministic and idempotent:

- missing managed files are created
- outdated managed files are replaced with the canonical package version
- current managed files are left untouched
- unrelated files are never modified
- unknown files in `.github/workflows` and `.vscode` are never deleted
- repeating `sync` after a successful run produces only `unchanged` results
- invalid target paths and write failures return a non-zero exit code

The canonical files are packaged with `@ankhorage/devtools`; synchronization does not fetch mutable files from GitHub at runtime.

## Managed GitHub Actions workflows

`workflows` owns exactly:

```text
.github/workflows/ci.yml
.github/workflows/release.yml
```

The CI workflow:

- checks out full history
- installs the pinned Bun version
- installs dependencies with `bun install --frozen-lockfile`
- runs `bunx @ankhorage/ankh doctor validate .`
- conditionally runs build, lint, format check, Knip, tests, and typecheck when scripts exist
- conditionally runs `changeset:status` for pull requests when the script exists

The release workflow:

- checks out full history
- configures Bun and Node for npm publishing
- installs dependencies with the frozen lockfile
- conditionally builds
- runs the Changesets release PR/publish flow
- protects release execution with a concurrency group
- skips cleanly when no Changesets configuration exists

## Managed VS Code configuration

`vscode` owns exactly:

```text
.vscode/settings.json
.vscode/extensions.json
```

The shared settings use the workspace TypeScript SDK, enable the workspace-SDK prompt, configure intentional ESLint save actions, and enforce basic whitespace/newline consistency.

The extension recommendations are limited to the standard Ankhorage workflow:

- Bun
- ESLint
- Prettier
- YAML
- GitHub Actions

`launch.json` is intentionally not managed globally. Libraries, CLIs, Expo packages, services, and integration repositories require different debug configurations.

## ESLint

Create `eslint.config.mjs`:

```js
import { createConfig } from '@ankhorage/devtools/eslint';

export default createConfig({
  files: ['src/**/*.{ts,tsx}'],
  project: ['./tsconfig.json'],
  tsconfigRootDir: import.meta.dirname,
});
```

## Prettier

ES modules:

```js
export { default } from '@ankhorage/devtools/prettier';
```

CommonJS:

```js
module.exports = require('@ankhorage/devtools/prettier');
```

## Knip

```ts
import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig();
```

Monorepos can use `createKnipMonorepoConfig` and add narrow repository-specific entries, projects, ignores, binaries, dependencies, or workspace overrides.

## Adding another managed concern

A new concern should:

1. live in its own sibling directory under `src/tools`
2. define only the files and behavior it owns
3. expose deterministic status and synchronization through the shared managed-file engine
4. add provider commands under `ankh devtools`
5. include source-tree, built-package, dry-run, status, and idempotence coverage
6. document overwrite and exit-code behavior

# devtools

Shared development tools and repository standards for Ankhorage TypeScript projects.

## What it owns

`@ankhorage/devtools` is the single source of truth for these separate concerns:

```text
src/
├── cli/
├── policy/
└── tools/
    ├── eslint/
    ├── prettier/
    ├── knip/
    ├── package/
    ├── workflows/
    └── vscode/
```

- `policy`: shared repository runtime policy, including the canonical Bun version
- `eslint`: shared flat ESLint configuration, automatic project profiles, and the bundled ESLint runner
- `prettier`: shared Prettier configuration and the bundled Prettier runner
- `knip`: shared Knip configuration helpers and the bundled Knip runner
- `package`: merge-aware synchronization of the shared `package.json` tooling and Bun runtime contract
- `workflows`: canonical `.github/workflows/ci.yml` and `release.yml`
- `vscode`: canonical `.vscode/settings.json` and `extensions.json`

The package owns the supported ESLint, TypeScript ESLint, Prettier, Knip, security, React, React Hooks, React Native, import/sort, unused-import, and formatting-plugin versions used by consuming repositories. It also owns the Bun runtime version used by Ankhorage repository metadata and managed workflows.

## Bootstrap

For a repository that does not yet depend on the shared toolchain:

```bash
bun add -D @ankhorage/devtools
bunx @ankhorage/ankh devtools sync .
```

After the first install, the normal workflow is:

```bash
ankh devtools sync
```

The target path is optional and defaults to the current working directory.

Synchronization ensures `@ankhorage/devtools` is declared using the version of the provider performing the sync, installs the standard package scripts, applies the managed Bun runtime policy, and removes direct devDependencies for tools/plugins owned by devtools. When package metadata changes, sync runs `bun install` so installed dependencies and `bun.lock` match the synchronized manifest. Unrelated package metadata, dependencies, and scripts are preserved.

`devtools sync` does not upgrade the globally installed Bun executable. The managed version applies to repository metadata, Bun types, and GitHub workflows.

## Ankh provider

The package is discovered under the `devtools` category and exposes these capabilities:

- `devtools.lint`
- `devtools.format`
- `devtools.knip`
- `devtools.sync`
- `devtools.status`
- `devtools.eslint.sync`
- `devtools.eslint.status`
- `devtools.prettier.sync`
- `devtools.prettier.status`
- `devtools.knip.sync`
- `devtools.knip.status`
- `devtools.package.sync`
- `devtools.package.status`
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

These delegate to the same bundled tools as the package binaries:

- `ankh devtools lint` → `ankhorage-eslint`
- `ankh devtools format` → `ankhorage-prettier`
- `ankh devtools knip` → `ankhorage-knip`

The synchronized package scripts are:

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

Synchronize or inspect every managed concern:

```bash
ankh devtools sync .
ankh devtools status .
```

Synchronize one concern:

```bash
ankh devtools eslint sync .
ankh devtools prettier sync .
ankh devtools knip sync .
ankh devtools package sync .
ankh devtools workflows sync .
ankh devtools vscode sync .
```

Report one concern:

```bash
ankh devtools eslint status .
ankh devtools prettier status .
ankh devtools knip status .
ankh devtools package status .
ankh devtools workflows status .
ankh devtools vscode status .
```

Preview synchronization without writing:

```bash
ankh devtools sync . --dry-run
ankh devtools eslint sync . --dry-run
ankh devtools package sync . --dry-run
```

A dry run reports `would create` and `would update` actions without mutating files. `status` exits with code `1` when managed state has drifted and `0` when it is current.

## Synchronization guarantees

Synchronization is deterministic and idempotent:

- missing managed artifacts are created
- outdated centrally owned artifacts are updated
- the managed Bun runtime version is applied consistently to package metadata and workflows
- package changes are followed by `bun install` after all managed files have been written, keeping installed dependencies and `bun.lock` synchronized without invalidating the running sync
- current artifacts are left untouched
- unrelated files and package fields are preserved
- repeated sync produces only `unchanged` results
- invalid target paths and write failures return a non-zero exit code
- create-only repository extension files are never overwritten after creation

The canonical workflow and VS Code files are packaged with `@ankhorage/devtools`; synchronization does not fetch mutable files from GitHub at runtime.

## ESLint profiles

`createConfig()` defaults to `profile: 'auto'`.

Automatic detection reads the consuming repository's `package.json` and delegates project trait detection to `@ankhorage/utility/project`. Dependency signals are considered across `dependencies`, `devDependencies`, and `peerDependencies`.

Profile precedence is:

```text
React Native / Expo
        ↓
react-native
        ↓ includes
react
        ↓ includes
base
```

A React or Next.js project selects `react`. A React Native or Expo project selects `react-native`. Everything else selects `base`.

An unusual repository can opt out of automatic selection:

```js
import { createConfig } from '@ankhorage/devtools/eslint';

export default createConfig({
  files: ['src/**/*.ts'],
  profile: 'base',
  project: ['./tsconfig.json'],
  tsconfigRootDir: import.meta.dirname,
});
```

The base profile enforces the shared TypeScript policy plus:

- maximum 50 effective lines per function
- maximum 300 effective lines per file
- modified cyclomatic complexity maximum 15
- security review for dynamic object access
- rejection of non-literal `require()` calls

The React profile adds React and React Hooks correctness rules. The React Native profile composes the React profile and adds the selected React Native style rules.

### Managed ESLint setup and local overrides

`ankh devtools eslint sync` centrally owns `eslint.config.mjs` and creates `eslint.local.config.mjs` once.

The canonical wrapper uses automatic profile detection and appends repository-owned flat-config entries:

```js
import { createConfig } from '@ankhorage/devtools/eslint';
import localConfig from './eslint.local.config.mjs';

const localEntries = Array.isArray(localConfig) ? localConfig : [localConfig];

export default [
  ...createConfig({
    files: ['src/**/*.{ts,tsx}'],
    project: ['./tsconfig.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  ...localEntries,
];
```

Use `eslint.local.config.mjs` for narrow repository-specific flat-config overrides, including temporary file-specific migration overrides. On first synchronization, an existing non-canonical `eslint.config.mjs` is preserved as the initial local config before the canonical wrapper is installed. Synchronization never overwrites that local file afterward.

## Prettier

`ankh devtools prettier sync` owns `.prettierrc.js`, emits the correct ESM or CommonJS wrapper based on the repository's `package.json` module type, and creates `prettier.local.config.js` once for narrow repository-specific options.

The consumer delegates formatting policy to:

```text
@ankhorage/devtools/prettier
```

The wrapper merges shared and local `overrides` in that order. On first synchronization, an existing non-canonical `.prettierrc.js` is preserved as `prettier.local.config.js`; later synchronization never overwrites the local file.

## Knip

`ankh devtools knip sync` bootstraps `knip.config.ts` with:

```ts
import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig();
```

`knip.config.ts` is create-only after bootstrap so repositories can retain narrow local entries, projects, ignores, binaries, dependencies, or switch to `createKnipMonorepoConfig()` without synchronization overwriting those extensions.

## Managed Bun runtime policy

The canonical Bun policy is defined once in devtools and consumed by both package and workflow synchronization. The current policy is:

```text
Bun runtime       1.3.14
packageManager    bun@1.3.14
@types/bun        ^1.3.14
```

Changing the policy in devtools therefore updates the repository-facing Bun version consistently instead of maintaining independent version literals in multiple templates.

## Managed package contract

`ankh devtools package sync` merge-updates `package.json` rather than replacing it.

It owns:

- the `@ankhorage/devtools` dependency version range
- `packageManager` according to the managed Bun runtime policy
- the `@types/bun` development dependency according to the managed Bun runtime policy
- `lint`
- `lint:fix`
- `format`
- `format:check`
- `knip`

For normal consumers, `@ankhorage/devtools` is a devDependency. `@ankhorage/ankh` keeps devtools as a runtime dependency because it loads the provider. Devtools itself participates in the Bun runtime policy without attempting to install itself as a consumer dependency.

When this managed package contract changes, synchronization runs `bun install`. This updates installed dependencies and `bun.lock` before sync completes. It also removes direct devDependencies for tools and ESLint plugins already provided by `@ankhorage/devtools`. Unrelated scripts, dependencies, metadata, and repository-specific configuration remain unchanged.

## Managed GitHub Actions workflows

`workflows` owns exactly:

```text
.github/workflows/ci.yml
.github/workflows/release.yml
```

Both workflows render their `bun-version` from the same managed Bun runtime policy used for `package.json`. The CI workflow installs that Bun version with the frozen lockfile, builds before repository-provider validation, runs `bunx @ankhorage/ankh doctor validate .`, and conditionally runs lint, formatting, Knip, tests, typecheck, and Changesets checks.

## Managed VS Code configuration

`vscode` owns exactly:

```text
.vscode/settings.json
.vscode/extensions.json
```

Unknown workflow and VS Code files are never deleted.

## Adding another managed concern

A new concern should:

1. live in its own sibling directory under `src/tools`
2. define only the files and behavior it owns
3. expose deterministic status and synchronization
4. add provider commands under `ankh devtools`
5. include dry-run, status, and idempotence coverage
6. document its central ownership and repository-owned extension points

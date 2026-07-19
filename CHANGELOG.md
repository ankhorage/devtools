# Changelog

## 1.3.3

### Patch Changes

- 599c140: Disable ESLint's core `no-unused-vars` rule for the shared TypeScript configuration and keep `unused-imports/no-unused-vars` as the TypeScript-aware unused-variable policy, including underscore-prefixed intentional omissions.

## 1.3.2

### Patch Changes

- 1f3eba8: Keep ESLint 10 and wrap the React Native ESLint plugin with `@eslint/compat` so React Native and Expo profiles can run legacy plugin rules without `context.getSourceCode is not a function` crashes.

## 1.3.1

### Patch Changes

- 42c66a4: Preserve `@ankhorage/devtools` as a runtime dependency when synchronizing `@ankhorage/ankh` package metadata.

## 1.3.0

### Minor Changes

- 60100e7: Add automatic base, React, and React Native ESLint profiles backed by shared project detection, centralize framework and security lint plugins, enforce shared size and complexity limits, and expand repository synchronization to ESLint, Prettier, Knip, and merge-aware package.json setup.

## 1.2.1

### Patch Changes

- bffe01a: Build repository providers before running Ankh Doctor validation in the canonical CI workflow so fresh CI checkouts can import their local provider modules.

## 1.2.0

### Minor Changes

- 4d844ad: Add canonical GitHub Actions and VS Code synchronization commands, move tool implementations under `src/tools`, and expose the complete `ankh devtools` provider surface.

## 1.1.2

### Patch Changes

- 13d368e: Allow direct imports from `@ankhorage/react-native-reanimated-dnd-web`, keep the upstream native package restricted, and remove the retired `@ankh/dnd` recommendation.

## 1.1.1

### Patch Changes

- 4bd331e: Expose the package command provider.

## 1.1.0

### Minor Changes

- a8db13b: Add Ankh provider metadata and provider-backed devtools commands for lint, format, and knip.

## 1.0.6

### Patch Changes

- 39f21fb: Add a monorepo Knip config preset for workspace-based repositories.

## 1.0.5

### Patch Changes

- 2092776: Fix bundled tool binary wrappers for packages that do not export their package metadata.

## 1.0.4

### Patch Changes

- dff66a6: Expose bundled `ankhorage-eslint`, `ankhorage-prettier`, and `ankhorage-knip` binaries for consuming repositories.

## 1.0.3

### Patch Changes

- 963db2b: Add a shared Knip config export and CI validation support.

## 1.0.2

### Patch Changes

- 4f5bca2: Reorganize tests and update configuration:
  - Move test files from `tests/` to `src/` to follow project standards.
  - Update `tsconfig.json` to exclude `*.test.ts` from build output.
  - Update `tsconfig.test.json` to include `*.test.ts` for linting and IDE support.
  - Update `eslint.config.mjs` to target test files in `src/`.

- ce4b37d: Standardize CI/release workflow files and update the Bun tooling baseline.

## 1.0.1

### Patch Changes

- Refresh the README copy so the published package overview, installation, usage, and tooling scope match the current messaging.

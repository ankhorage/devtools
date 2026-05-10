# Changelog

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

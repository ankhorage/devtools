# Changelog

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

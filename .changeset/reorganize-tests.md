---
'@ankhorage/devtools': patch
---

Reorganize tests and update configuration:

- Move test files from `tests/` to `src/` to follow project standards.
- Update `tsconfig.json` to exclude `*.test.ts` from build output.
- Update `tsconfig.test.json` to include `*.test.ts` for linting and IDE support.
- Update `eslint.config.mjs` to target test files in `src/`.

# Changelog

## 1.9.1

### Patch Changes

- e510692: Pin the managed Renovate workflow to the immutable merge commit so GitHub can resolve and start the reusable workflow.

## 1.9.0

### Minor Changes

- 7afe4e1: Distribute the implicitly invoked `ankhorage-coding-rules` baseline skill for canonical Git, lint, testing, Paradox documentation, validation, and pull-request delivery practices.
- 7afe4e1: Add managed repository agent instructions and exact, ownership-aware synchronization for the canonical `ankhorage-project-structure` skill.

## 1.8.6

### Patch Changes

- 28ff6f0: Update Devtools-owned dependencies: `@changesets/cli`, `@types/node`, `eslint-plugin-simple-import-sort`, `typescript`.

## 1.8.5

### Patch Changes

- f5cda2a: Pass the organization-managed Ankhorage Renovate Sync GitHub App credentials to the trusted
  dependency synchronization workflow so its commits start normal pull-request CI automatically.

## 1.8.4

### Patch Changes

- c921e33: Update Devtools-owned dependencies: `@ankhorage/doctor`, `knip`, `typescript-eslint`.

## 1.8.3

### Patch Changes

- 654ac78: Pin consumer Renovate automation to the trust boundary that authorizes the upcoming managed agent-instruction and project-structure skill outputs.

## 1.8.2

### Patch Changes

- d2bf38b: Validate trusted Version Packages pull requests without requiring a new unreleased Changeset while preserving the strict missing-Changeset guard for ordinary pull requests.
- 629711a: Validate Version Packages metadata against the detached release checkout itself so CI does not require a local `main` branch while preserving the strict ordinary-PR Changeset guard.

## 1.8.1

### Patch Changes

- c230409: Update Devtools-owned dependencies: `@ankhorage/ankh`.

## 1.8.0

### Minor Changes

- d266e7c: Centralize Changesets execution, package scripts, and managed workflow commands in Devtools.

## 1.7.2

### Patch Changes

- 60910fd: Update Devtools-owned dependencies: `@changesets/cli`, `@types/bun`, `@types/node`, `bun`, `eslint`, `eslint-plugin-prettier`, `knip`, `prettier`, `typescript-eslint`.

## 1.7.1

### Patch Changes

- 78a88ad: Activate the Devtools-owner Renovate policy with a single Bun version authority, current Ankh/Doctor validation baselines, and trusted, byte-stable owner artifact synchronization.

## 1.7.0

### Minor Changes

- e2b6338: Distribute the secure Renovate Changeset workflow and enable CI dispatch for bot-authored Changeset commits.

### Patch Changes

- f581668: Rename the synchronized Knip package script to `knip:check` so Expo Doctor no longer rejects generated Expo applications for colliding with the installed `knip` binary.

## 1.6.1

### Patch Changes

- 2181e60: Write managed repository files before running the dependency install so a sync cannot invalidate its own packaged asset paths. Preserve repository-specific Prettier options in a create-only local configuration while keeping the shared wrapper centrally managed, without carrying former shared-only Devtools delegates into the local configuration.

## 1.6.0

### Minor Changes

- ca42420: Add the canonical Node 24 LTS tooling policy and render managed CI/release workflows from the shared Bun and Node runtime baselines.

## 1.5.2

### Patch Changes

- 9066ccb: Remove the organization-wide `ankhorage/no-forward-exports` ESLint policy and its package-entrypoint resolver. Forward-export and module-ownership decisions are no longer enforced globally by Devtools.

## 1.5.1

### Patch Changes

- e9a2a20: Allow `ankhorage/no-forward-exports` in public package entrypoints declared through package metadata while keeping ordinary implementation modules ownership-strict.

## 1.5.0

### Minor Changes

- 5b3ac81: Enforce module export ownership across shared ESLint consumers by rejecting forward exports outside `index.*` barrels, and add real ESLint execution coverage proving import/export sorting and the central TypeScript/import/formatting policies remain active.

## 1.4.1

### Patch Changes

- af12660: Expose the canonical Bun runtime policy through the public `@ankhorage/devtools/policy` package subpath so validation packages can consume it without duplicating the policy version.

## 1.4.0

### Minor Changes

- 90aa531: Centralize Bun 1.3.14 as the managed repository runtime policy. Repository sync now aligns `packageManager`, `@types/bun`, generated GitHub workflows, and the Bun lockfile from the same policy.

## 1.3.4

### Patch Changes

- 062a084: Scope the recommended ESLint rules to each `createConfig()` file set so composing multiple shared configs does not leak core rules such as `no-unused-vars` across unrelated TypeScript files.

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

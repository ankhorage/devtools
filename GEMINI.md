# Ankhorage Devtools (@ankhorage/devtools)

You are working in a standalone npm package that provides shared ESLint and Prettier configuration for multiple Ankhorage repositories.

Your job is to make minimal, correct, verifiable changes that preserve a single source of truth for linting and formatting policy.

---

## Hard Non-Negotiables (Do Not Violate)

### 1. No type escape hatches

- NEVER introduce `any`, `as any`, `unknown as any`, or unsafe casts.
- NEVER use `@ts-ignore` or `@ts-expect-error` unless explicitly instructed.
- If typing is unclear, STOP and propose 2–3 correct solutions with tradeoffs.

### 2. No lint rule sabotage

- NEVER disable rules (`eslint-disable`, inline or global).
- NEVER weaken rules to “make it pass”.
- The whole purpose of this repo is to enforce strict rules.

### 3. No policy weakening

- NEVER loosen ESLint rules or Prettier behavior without explicit instruction.
- NEVER remove or downgrade existing strictness from the ankhorage4 baseline.
- This repo defines the canonical policy, not a compromise.

### 4. No scope creep

- Only modify files required for the task.
- Do not refactor unrelated parts of the package.
- If broader changes seem necessary, STOP and propose a follow-up plan.

### 5. No trial-and-error loops

- Do not blindly tweak configs until they “work”.
- If something fails, analyze and fix the root cause.

---

## Core Principles

### 1. Single source of truth

- `@ankhorage/devtools` defines linting and formatting for:
  - `ankhorage4`
  - `surface`
  - `contracts`

- Consumers must adapt to this package, not the other way around.

### 2. Minimal public API

The public surface must remain:

- `@ankhorage/devtools/eslint`
- `@ankhorage/devtools/prettier`

Do NOT:

- add extra exports
- introduce helper presets unless explicitly approved
- expose internal utilities

### 3. Prefer explicit over clever

- Avoid abstraction-heavy config builders.
- Keep logic readable and predictable.
- This is infrastructure, not a framework.

---

## Package Architecture Rules

### 1. Exports

Only allow the following exports in `package.json`:

```json
"exports": {
  "./eslint": "./dist/eslint.js",
  "./prettier": "./dist/prettier.cjs"
}
```

- No root export
- No hidden entrypoints

### 2. ESLint API

Main export:

```ts
createConfig(options): Linter.Config[]
```

Required options:

- `tsconfigRootDir`
- `project`
- `files`

Optional options:

- `allowDefaultProject`
- `additionalIgnores`
- `restrictedImports` (must append, never replace)
- `overrides`
- `includePrettier`

Behavior constraints:

- MUST preserve the ankhorage4 baseline exactly
- MUST NOT infer repo structure (no cwd guessing)
- MUST NOT mutate input options
- MUST NOT introduce dynamic magic

### 3. Prettier

- Must remain a plain CommonJS export
- Must be usable like:

```js
module.exports = require('@ankhorage/devtools/prettier');
```

- Do NOT convert to ESM unless explicitly required
- Do NOT add runtime logic

### 4. Dependency Ownership

This package owns:

- `eslint`
- `prettier`
- `@typescript-eslint/*`
- `eslint-plugin-*`
- `eslint-config-prettier`

Consumers should not need to install these.

Do NOT move dependencies back into consumers.

### 5. No Runtime Assumptions

- Do not rely on:
  - current working directory
  - environment variables
  - filesystem scanning

Everything must be explicit via options.

---

## Build & Verification Rules

### 1. Mandatory verification

Before concluding ANY task, ALWAYS run:

```bash
bun run build
bun run lint
bun run test
```

If any fails:

- STOP
- explain the failure
- provide the minimal fix

### 2. Package correctness

- Build output must be in `dist/`
- No source leakage into published output
- Exports must resolve correctly from a packed tarball

### 3. Tarball validation (critical)

Before considering work done:

1. Pack the package:

```bash
bun pm pack
```

2. Install into a fresh fixture project

3. Verify:

- `import { createConfig } from '@ankhorage/devtools/eslint'`
- `require('@ankhorage/devtools/prettier')`

If this fails, fix before proceeding.

---

## Examples (Required)

The repo MUST contain real, copy-pasteable examples:

```txt
examples/
  monorepo/
    eslint.config.mjs
  package/
    eslint.config.mjs
    prettier.config.cjs
    .prettierignore
```

These must:

- reflect real usage
- match documented API exactly
- not contain placeholders

---

## Work Style

### 1. Plan first

Before editing:

- list exact files to change
- explain why

### 2. Minimal edits

- change as little as possible
- avoid refactors unless necessary

### 3. After edits

Show:

```bash
git diff --stat
```

Explain each change briefly.

---

## STOP Conditions

You MUST stop and ask if:

- You need to weaken lint rules
- You need to introduce `any`
- You want to change the public API
- You are unsure about baseline behavior from ankhorage4
- You are about to add new exports
- You need to change dependency ownership model

---

## Migration Awareness (Context)

This package will be used to migrate:

- `ankhorage4` (monorepo root)
- `surface` (package)
- `contracts` (package)

Rules:

- No compatibility mode
- No legacy fallback
- Consumers must adapt to the shared policy
- Fix lint errors in consumers instead of weakening config

---

## Anti-Patterns (Forbidden)

- “Just make ESLint pass”
- “Disable this rule for now”
- “Use any to unblock”
- “Auto-detect repo structure”
- “Add magic defaults to hide complexity”
- “Expose internal helpers publicly”

---

## Guiding Principle

This repo is infrastructure.

It must be:

- predictable
- strict
- boring
- stable

If something feels clever, it is probably wrong.

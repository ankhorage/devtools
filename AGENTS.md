# AGENTS.md

<!-- This file is managed by @ankhorage/devtools. -->

## Repository

Package: `@ankhorage/devtools`

Shared development tools and repository standards for Ankhorage

## Current architecture only

Only the current Ankhorage architecture is valid. Do not add or retain deprecated APIs,
compatibility aliases, shims, dual old/new paths, historical-state fallbacks, or migrations whose
sole purpose is supporting obsolete states. Remove superseded implementations instead.

When a canonical change affects another repository, update that repository to the latest released
public API instead of preserving compatibility locally. Cross-package usage must go through
published public APIs and declared dependencies, never sibling source files.

Current-runtime error handling and canonical database or infrastructure migrations remain valid
when they support states that the current architecture can intentionally produce.

## Required repository instructions

Before changing any file, read this `AGENTS.md` completely and inspect `.agents/skills/`.
Load and follow every repository-local skill relevant to the task before making changes. Continue
to follow these instructions and skills through validation and delivery; do not substitute
remembered, globally installed, or generic guidance for the repository-local versions.

For every implementation, refactor, test, review, or delivery task, load and follow
`.agents/skills/ankhorage-coding-rules/SKILL.md`. For directory ownership, package boundaries,
architectural profiles, ports and adapters, public entrypoints, or cross-repository structural work,
also load and follow `.agents/skills/ankhorage-project-structure/SKILL.md` and every additional
skill it requires.

## Pull requests

Before creating a pull request, run all of these commands in this order and resolve every failure:

```sh
bun run build
bun run check-types
bun run lint
bun run knip:test
bun run changeset
bun run format
```

## Skill scripts

Scripts inside an Agent Skill must always be TypeScript files with the `.ts` extension.
JavaScript skill scripts using `.js`, `.mjs`, or `.cjs` are not allowed. Run TypeScript
skill scripts with Bun.

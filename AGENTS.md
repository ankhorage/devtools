# AGENTS.md

<!-- This file is managed by @ankhorage/devtools. -->


## Repository

Package: `@ankhorage/devtools`

Title: Ankhorage Devtools

Owns shared repository automation, managed development tooling, workflows, and agent standards for Ankhorage TypeScript projects.

Purpose: Keep standalone repositories aligned through released, reusable tooling instead of copied project-specific automation.

Audience:

- Maintainers of standalone Ankhorage TypeScript repositories.
- Automation and CI workflows that consume managed repository policy.

## Scope and boundaries

Responsibilities:

- Publish managed ESLint, Prettier, Knip, workflow, editor, agent, and repository-file policies.
- Expose CLI commands for repository synchronization, package maintenance, structure checks, changesets, and CI impact planning.
- Distribute canonical agent instructions and skills to independently versioned repositories.
- Provide advisory metadata initialization and status tooling backed by the published repository rules.

Boundaries:

- Does not own portable contracts, repository rule semantics, or Doctor's final blocking validation.
- Does not own application or package domain behavior in managed repositories.
- Does not require sibling source checkouts or unpublished organization-local dependencies.

Architecture role: Tooling package and CLI composition layer over released contracts, rules, project detection, and reusable utilities.

Architectural invariants:

- Managed repositories remain independently installable and usable.
- Canonical policy is consumed from its owning published package instead of duplicated.
- Repository synchronization is deterministic and reviewable.


## Current architecture only

Only the current Ankhorage architecture is valid. Do not add or retain deprecated APIs,
compatibility aliases, shims, dual old/new paths, historical-state fallbacks, or migrations whose
sole purpose is supporting obsolete states. Remove superseded implementations instead.

When a canonical change affects another repository, update that repository to the latest released
public API instead of preserving compatibility locally. Cross-package usage must go through
published public APIs and declared dependencies, never sibling source files.

Current-runtime error handling and canonical database or infrastructure migrations remain valid
when they support states that the current architecture can intentionally produce.

## Standalone contract

Every repository managed by `@ankhorage/devtools` is standalone. It must be independently
installable, buildable, testable, and usable from its own checkout using only declared dependencies
and explicit configuration. It must not require sibling repositories, sibling source imports,
`workspace:`, `file:`, or `link:` dependencies to unpublished packages, hidden
organization-local state, or assumptions about a specific consuming application, infrastructure,
hosting provider, web server, container runtime, or deployment topology.

Published packages are additionally consumer-agnostic and reusable outside Ankhorage.
Environment- or provider-specific behavior belongs behind explicit configuration and adapters,
never in the package core.

If an existing repository violates this contract, treat that as architecture debt to remove, not
as an exception to preserve.

## Required repository instructions

Before changing any file, read this `AGENTS.md` completely and inspect `.agents/skills/`.
Treat skill selection as a mandatory precondition to editing, then follow every selected skill
through validation and delivery.

- Load `.agents/skills/ankhorage-coding-rules/SKILL.md` for implementation, refactoring, testing,
  review, or pull-request delivery work.
- Load `.agents/skills/ankhorage-project-structure/SKILL.md` when the task changes or reviews
  directory ownership, package boundaries, public entrypoints, cross-repository ownership, type or
  utility placement, or source architecture.
- Load every additional repository-local skill whose description or requirements match the task,
  including skills required by any selected skill. These rules define mandatory minimums, not an
  allow-list; do not skip a useful relevant skill merely because it is not named here.

Do not load unrelated skills merely because they are installed. If the task scope expands, inspect
`.agents/skills/` again and load the newly relevant skills before continuing. Do not substitute
remembered, globally installed, or generic guidance for the repository-local versions.

## Documentation

`README.md` and the configured Paradox output are generated release artifacts. Never edit them
manually, and do not regenerate or commit them in ordinary feature pull requests. Update the owning
Paradox `/*** ... */` comments in `src` and leading `@usage` comments in real
`examples/<example>/...` source files, plus any repository-owned manual documentation outside the
generated output. The managed release workflow runs `bun run docs` after the package version bump
and commits the regenerated artifacts in the release commit.

## GitHub task lifecycle and workspace cleanup

- **Start.** Treat each issue implementation, PR implementation, review, and change request (CR)
  as an independent task. Fetch the current remote default branch and read the applicable issue,
  PR, HEAD, review feedback, and CI state. Use a fresh, uniquely named task checkout or worktree.
  Concurrent tasks must have distinct writable checkout, temporary, build, and cache paths.
- **CRs.** Fetch and check out the current remote PR branch in the new workspace. Preserve PR
  history and scope. Push corrections to the existing PR branch.
- **Delivery.** Run applicable checks. Commit and push all intended changes, then verify that
  GitHub has the intended commit on the correct remote branch. Report the exact HEAD, checks, CI,
  findings, and blockers. Report acceptance that was not run as unverified. Read-only reviews hand
  off their findings without creating a commit. Merge requires explicit authorization.
- **Cleanup.** After handoff, remove only directories created and owned by the task whose resolved
  paths are strictly under `/tmp`. Use Git-aware removal for worktrees. Preserve workspaces outside
  `/tmp`, shared directories, other tasks' directories, uncommitted changes, and unpushed commits.
  If blocked, persist recoverable work first and document what must be retained. Report whether
  cleanup succeeded, was skipped, or was blocked.

## Pull requests

Before creating a pull request, run all of these commands in this order and resolve every failure:

```sh
bun run build
bun run check-types
bun run lint
bun run knip:check
bun run changeset
bun run format
```

For repositories that use Changesets, run `bun run changeset` only for release-impacting work.
No Changeset means no release is requested. Never add an empty Changeset to satisfy CI; remove it
for a no-release pull request, or add explicit release intent before validation.

## Skill scripts

Scripts inside an Agent Skill must always be TypeScript files with the `.ts` extension.
JavaScript skill scripts using `.js`, `.mjs`, or `.cjs` are not allowed. Run TypeScript
skill scripts with Bun.

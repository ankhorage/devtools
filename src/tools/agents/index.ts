import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../shared/managedFiles.js';

export const agentsManagedFiles = [
  {
    relativePath: 'AGENTS.md',
    render: renderAgentsFile,
  },
] as const satisfies readonly ManagedFileDefinition[];

/*** Render mandatory repository instructions from the target package identity. */
async function renderAgentsFile(targetDirectory: string): Promise<string> {
  const manifest = await readPackageManifest(targetDirectory);
  const packageName = readNonEmptyString(manifest.name) ?? 'Package name not declared';
  const description =
    readNonEmptyString(manifest.description) ?? 'No package description is declared.';

  return `# AGENTS.md

<!-- This file is managed by @ankhorage/devtools. -->

## Repository

Package: \`${escapeInlineCode(packageName)}\`

${description}

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

Before changing any file, read this \`AGENTS.md\` completely and inspect \`.agents/skills/\`.
Treat skill selection as a mandatory precondition to editing, then follow every selected skill
through validation and delivery.

- Load \`.agents/skills/ankhorage-coding-rules/SKILL.md\` for implementation, refactoring, testing,
  review, or pull-request delivery work.
- Load \`.agents/skills/ankhorage-project-structure/SKILL.md\` when the task changes or reviews
  directory ownership, package boundaries, public entrypoints, cross-repository ownership, type or
  utility placement, or source architecture.
- Load every additional repository-local skill whose description or requirements match the task,
  including skills required by any selected skill. These rules define mandatory minimums, not an
  allow-list; do not skip a useful relevant skill merely because it is not named here.

Do not load unrelated skills merely because they are installed. If the task scope expands, inspect
\`.agents/skills/\` again and load the newly relevant skills before continuing. Do not substitute
remembered, globally installed, or generic guidance for the repository-local versions.

## Documentation

\`README.md\` and the configured Paradox output are generated release artifacts. Never edit them
manually, and do not regenerate or commit them in ordinary feature pull requests. Update the owning
Paradox \`/*** ... */\` comments in \`src\`, including \`@readme\` tags where the content belongs in
the README, plus any repository-owned manual documentation outside the generated output. The managed
release workflow runs \`bun run docs\` after the package version bump and commits the regenerated
artifacts in the release commit.

## Pull requests

Before creating a pull request, run all of these commands in this order and resolve every failure:

\`\`\`sh
bun run build
bun run check-types
bun run lint
bun run knip:check
bun run changeset
bun run format
\`\`\`

## Skill scripts

Scripts inside an Agent Skill must always be TypeScript files with the \`.ts\` extension.
JavaScript skill scripts using \`.js\`, \`.mjs\`, or \`.cjs\` are not allowed. Run TypeScript
skill scripts with Bun.
`;
}

async function readPackageManifest(targetDirectory: string): Promise<Record<string, unknown>> {
  try {
    const contents = await readFile(resolve(targetDirectory, 'package.json'), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('package.json must contain a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function escapeInlineCode(value: string): string {
  return value.replaceAll('`', '\\`');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

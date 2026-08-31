import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../shared/managedFiles.js';

export const agentsManagedFiles = [
  {
    relativePath: 'AGENTS.md',
    render: renderAgentsFile,
  },
] as const satisfies readonly ManagedFileDefinition[];

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

## Project structure

For directory ownership, package boundaries, architectural profiles, ports and adapters, public
entrypoints, or cross-repository structural work, load and follow
\`.agents/skills/ankhorage-project-structure/SKILL.md\`.
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

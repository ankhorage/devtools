import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';

const TRACKED_DOCUMENTATION_PATTERNS = new Set([
  'docs',
  'docs/',
  '/docs',
  '/docs/',
  'paradox',
  'paradox/',
  '/paradox',
  '/paradox/',
]);

export const gitignoreManagedFiles = [
  {
    relativePath: '.gitignore',
    render: renderGitignore,
  },
] as const satisfies readonly ManagedFileDefinition[];

/*** Preserve repository-owned ignore rules while keeping documentation directories trackable. */
async function renderGitignore(targetDirectory: string): Promise<string> {
  const contents = await readGitignoreAsync(targetDirectory);
  return contents
    .split('\n')
    .filter((line) => !TRACKED_DOCUMENTATION_PATTERNS.has(line.trim()))
    .join('\n');
}

/*** Use the minimal shared ignore defaults only when the repository has no ignore file. */
async function readGitignoreAsync(targetDirectory: string): Promise<string> {
  try {
    return await readFile(resolve(targetDirectory, '.gitignore'), 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return 'node_modules\ndist\n';
    throw error;
  }
}

/*** Check whether an unknown failure carries a Node.js error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../shared/managedFiles.js';

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
    isApplicable: isGitignorePresent,
  },
] as const satisfies readonly ManagedFileDefinition[];

/*** Preserve repository-owned ignore rules while keeping documentation directories trackable. */
async function renderGitignore(targetDirectory: string): Promise<string> {
  const contents = await readFile(resolve(targetDirectory, '.gitignore'), 'utf8');
  return contents
    .split('\n')
    .filter((line) => !TRACKED_DOCUMENTATION_PATTERNS.has(line.trim()))
    .join('\n');
}

/*** Report whether a repository already owns a `.gitignore` file that can be normalized. */
async function isGitignorePresent(targetDirectory: string): Promise<boolean> {
  try {
    await access(resolve(targetDirectory, '.gitignore'));
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

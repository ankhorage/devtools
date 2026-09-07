import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../shared/managedFiles.js';

const ESLINT_CONFIG = `import { createConfig } from '@ankhorage/devtools/eslint';
import localConfig from './eslint.local.config.mjs';

const localEntries = Array.isArray(localConfig) ? localConfig : [localConfig];

export default [
  ...createConfig({
    files: ['src/**/*.{ts,tsx}'],
    project: ['./tsconfig.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  ...localEntries,
];
`;

const EMPTY_LOCAL_CONFIG = `export default [];
`;

const EXAMPLES_OWNERSHIP_MARKER = '// This file is managed by @ankhorage/devtools.\n';

const ESLINT_EXAMPLES_CONFIG = `${EXAMPLES_OWNERSHIP_MARKER}import { existsSync } from 'node:fs';

import { createConfig } from '@ankhorage/devtools/eslint';
import localConfig from './eslint.local.config.mjs';

const exampleFiles = ['examples/**/*.{ts,tsx}'];
const localEntries = Array.isArray(localConfig) ? localConfig : [localConfig];
const rootProjects = ['./tsconfig.eslint.json', './tsconfig.json'].filter((project) =>
  existsSync(new URL(project, import.meta.url)),
);

export default [
  ...createConfig({
    files: exampleFiles,
    project: [...rootProjects, './examples/**/tsconfig.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  ...localEntries,
];
`;

export const eslintManagedFiles = [
  {
    relativePath: 'eslint.local.config.mjs',
    render: renderInitialLocalConfig,
    mode: 'create-only',
  },
  {
    relativePath: 'eslint.config.mjs',
    contents: ESLINT_CONFIG,
  },
  {
    relativePath: 'eslint.examples.config.mjs',
    contents: ESLINT_EXAMPLES_CONFIG,
    isApplicable: hasExamplesDirectory,
  },
] as const satisfies readonly ManagedFileDefinition[];

async function renderInitialLocalConfig(targetDirectory: string): Promise<string> {
  try {
    const existingConfig = await readFile(resolve(targetDirectory, 'eslint.config.mjs'), 'utf8');
    return existingConfig === ESLINT_CONFIG ? EMPTY_LOCAL_CONFIG : existingConfig;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return EMPTY_LOCAL_CONFIG;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/*** Report whether the target repository owns public examples at its root. */
async function hasExamplesDirectory(targetDirectory: string): Promise<boolean> {
  await assertExamplesConfigOwnershipAsync(targetDirectory);
  try {
    return (await stat(resolve(targetDirectory, 'examples'))).isDirectory();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/*** Require explicit adoption of consumer overrides before managing an existing examples config. */
async function assertExamplesConfigOwnershipAsync(targetDirectory: string): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(resolve(targetDirectory, 'eslint.examples.config.mjs'), 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
  if (!contents.startsWith(EXAMPLES_OWNERSHIP_MARKER)) {
    throw new Error(
      'Cannot replace consumer-owned eslint.examples.config.mjs. ' +
        'Move its repository-specific overrides into eslint.local.config.mjs, keeping their ' +
        'examples file scope and preserving existing local entries. Then remove the old examples ' +
        'config and rerun sync to create the Devtools-managed wrapper.',
    );
  }
}

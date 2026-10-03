import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { EXAMPLES_ESLINT_OWNERSHIP_MARKER } from '../../constants/eslint.js';
import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';

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

const IGNORED_EXAMPLE_DIRECTORY_NAMES = new Set([
  '.expo',
  '.next',
  'android',
  'build',
  'dist',
  'files',
  'ios',
  'node_modules',
  'templates',
]);

const ESLINT_EXAMPLES_CONFIG = `${EXAMPLES_ESLINT_OWNERSHIP_MARKER}import { existsSync } from 'node:fs';

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
    isApplicable: hasTypeScriptExamples,
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

/*** Report whether the target repository owns TypeScript source examples at its root. */
async function hasTypeScriptExamples(targetDirectory: string): Promise<boolean> {
  await assertExamplesConfigOwnershipAsync(targetDirectory);
  return await containsTypeScriptExampleAsync(resolve(targetDirectory, 'examples'));
}

/*** Report whether a directory tree contains a TypeScript or TSX source example. */
async function containsTypeScriptExampleAsync(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map(async (entry) =>
          entry.isDirectory() && !IGNORED_EXAMPLE_DIRECTORY_NAMES.has(entry.name)
            ? await containsTypeScriptExampleAsync(resolve(directory, entry.name))
            : entry.isFile() && isTypeScriptExampleSource(entry.name),
        ),
      )
    ).some(Boolean);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/*** Report whether a file is lintable TypeScript example source rather than a declaration. */
function isTypeScriptExampleSource(fileName: string): boolean {
  return /\.tsx?$/u.test(fileName) && !fileName.endsWith('.d.ts');
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
  if (!contents.startsWith(EXAMPLES_ESLINT_OWNERSHIP_MARKER)) {
    throw new Error(
      'Cannot replace consumer-owned eslint.examples.config.mjs. ' +
        'Move its repository-specific overrides into eslint.local.config.mjs, keeping their ' +
        'examples file scope and preserving existing local entries. Then remove the old examples ' +
        'config and rerun sync to create the Devtools-managed wrapper.',
    );
  }
}

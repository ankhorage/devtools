import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { EXAMPLES_ESLINT_OWNERSHIP_MARKER } from '../../constants/eslint.js';
import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';

const DEFAULT_SOURCE_GLOBS = ['src/**/*.{ts,tsx}'];
const NEXT_JAVASCRIPT_SOURCE_GLOBS = [
  'src/**/*.{js,mjs,cjs}',
  'app/**/*.{js,mjs,cjs}',
  'components/**/*.{js,mjs,cjs}',
  'lib/**/*.{js,mjs,cjs}',
  'worker/**/*.{js,mjs,cjs}',
  'scripts/**/*.{js,mjs,cjs}',
  'tests/**/*.{js,mjs,cjs}',
];
const NEXT_SOURCE_GLOBS = [
  ...DEFAULT_SOURCE_GLOBS,
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'worker/**/*.{ts,tsx}',
  'scripts/**/*.{ts,tsx}',
  'tests/**/*.{ts,tsx}',
];

function renderEslintConfig(
  sourceGlobs: readonly string[],
  javascriptSourceGlobs: readonly string[] = [],
): string {
  return `import { createConfig } from '@ankhorage/devtools/eslint';
import localConfig from './eslint.local.config.mjs';

const localEntries = Array.isArray(localConfig) ? localConfig : [localConfig];

export default [
  ...createConfig({
    files: ${JSON.stringify(sourceGlobs)},
    javascriptFiles: ${JSON.stringify(javascriptSourceGlobs)},
    project: ['./tsconfig.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  ...localEntries,
];
`;
}

const ESLINT_CONFIG = renderEslintConfig(DEFAULT_SOURCE_GLOBS);

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
    render: renderManagedEslintConfigAsync,
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

/*** Render canonical TypeScript and JavaScript scopes for the target's application profile. */
async function renderManagedEslintConfigAsync(targetDirectory: string): Promise<string> {
  const manifest = await readPackageManifestAsync(targetDirectory);
  return isNextApplication(manifest)
    ? renderEslintConfig(NEXT_SOURCE_GLOBS, NEXT_JAVASCRIPT_SOURCE_GLOBS)
    : renderEslintConfig(DEFAULT_SOURCE_GLOBS);
}

/*** Read the optional target manifest without changing the default source profile. */
async function readPackageManifestAsync(targetDirectory: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(targetDirectory, 'package.json'), 'utf8')) as unknown;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/*** Report whether a manifest directly declares Next.js. */
function isNextApplication(manifest: unknown): boolean {
  if (!isRecord(manifest)) return false;
  return [manifest.dependencies, manifest.devDependencies].some(
    (dependencies) => isRecord(dependencies) && typeof dependencies.next === 'string',
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

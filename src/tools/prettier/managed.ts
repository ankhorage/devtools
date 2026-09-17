import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../shared/managedFiles.js';

const ESM_CONFIG = `import sharedConfig from '@ankhorage/devtools/prettier';
import localConfig from './prettier.local.config.js';

export default {
  ...sharedConfig,
  ...localConfig,
  overrides: [...(sharedConfig.overrides ?? []), ...(localConfig.overrides ?? [])],
};
`;
const COMMONJS_CONFIG = `const sharedConfig = require('@ankhorage/devtools/prettier');
const localConfig = require('./prettier.local.config.js');

module.exports = {
  ...sharedConfig,
  ...localConfig,
  overrides: [...(sharedConfig.overrides ?? []), ...(localConfig.overrides ?? [])],
};
`;
const EMPTY_ESM_LOCAL_CONFIG = `export default {};
`;
const EMPTY_COMMONJS_LOCAL_CONFIG = `module.exports = {};
`;
const LEGACY_ESM_CONFIG = `export { default } from '@ankhorage/devtools/prettier';
`;
const LEGACY_COMMONJS_CONFIG = `module.exports = require('@ankhorage/devtools/prettier');
`;
const REQUIRED_PRETTIER_IGNORE_ENTRIES = ['node_modules', 'dist', 'README.md', 'paradox/'] as const;

/*** Defines the Prettier files and ignore policy managed for consuming repositories. */
export const prettierManagedFiles = [
  {
    relativePath: 'prettier.local.config.js',
    render: renderInitialLocalConfig,
    mode: 'create-only',
  },
  {
    relativePath: '.prettierrc.js',
    render: renderPrettierConfig,
  },
  {
    relativePath: '.prettierignore',
    render: renderPrettierIgnore,
  },
] as const satisfies readonly ManagedFileDefinition[];

/*** Renders the shared Prettier wrapper for the target package module type. */
async function renderPrettierConfig(targetDirectory: string): Promise<string> {
  return (await readPackageType(targetDirectory)) === 'module' ? ESM_CONFIG : COMMONJS_CONFIG;
}

/*** Preserves an existing repository Prettier config as its initial local extension. */
async function renderInitialLocalConfig(targetDirectory: string): Promise<string> {
  const isModule = (await readPackageType(targetDirectory)) === 'module';
  try {
    const existingConfig = await readFile(resolve(targetDirectory, '.prettierrc.js'), 'utf8');
    if (!isSharedOnlyConfig(existingConfig)) return existingConfig;
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
  }
  return isModule ? EMPTY_ESM_LOCAL_CONFIG : EMPTY_COMMONJS_LOCAL_CONFIG;
}

/*** Preserves repository-owned ignore entries while appending required generated-artifact ignores. */
async function renderPrettierIgnore(targetDirectory: string): Promise<string> {
  const existing = await readFile(resolve(targetDirectory, '.prettierignore'), 'utf8').catch(
    (error: unknown) => {
      if (isNodeError(error) && error.code === 'ENOENT') return '';
      throw error;
    },
  );
  const existingEntries = new Set(
    existing
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#')),
  );
  const missingEntries = REQUIRED_PRETTIER_IGNORE_ENTRIES.filter(
    (entry) => !existingEntries.has(entry),
  );

  if (missingEntries.length === 0) {
    return existing.endsWith('\n') ? existing : `${existing}\n`;
  }
  const prefix = existing === '' ? '' : existing.endsWith('\n') ? existing : `${existing}\n`;
  return `${prefix}${missingEntries.join('\n')}\n`;
}

/*** Reads whether the target package uses ESM or CommonJS package semantics. */
async function readPackageType(targetDirectory: string): Promise<string | undefined> {
  try {
    const contents = await readFile(resolve(targetDirectory, 'package.json'), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    return isRecord(parsed) && typeof parsed.type === 'string' ? parsed.type : undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/*** Narrows an unknown JSON value to a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Identifies Prettier wrappers that contain no repository-owned configuration. */
function isSharedOnlyConfig(value: string): boolean {
  return [ESM_CONFIG, COMMONJS_CONFIG, LEGACY_ESM_CONFIG, LEGACY_COMMONJS_CONFIG].includes(value);
}

/*** Narrows an unknown error to a Node error carrying an error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

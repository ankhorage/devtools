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
] as const satisfies readonly ManagedFileDefinition[];

async function renderPrettierConfig(targetDirectory: string): Promise<string> {
  return (await readPackageType(targetDirectory)) === 'module' ? ESM_CONFIG : COMMONJS_CONFIG;
}

async function renderInitialLocalConfig(targetDirectory: string): Promise<string> {
  const isModule = (await readPackageType(targetDirectory)) === 'module';
  try {
    const existingConfig = await readFile(resolve(targetDirectory, '.prettierrc.js'), 'utf8');
    if (existingConfig !== ESM_CONFIG && existingConfig !== COMMONJS_CONFIG) return existingConfig;
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
  }
  return isModule ? EMPTY_ESM_LOCAL_CONFIG : EMPTY_COMMONJS_LOCAL_CONFIG;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

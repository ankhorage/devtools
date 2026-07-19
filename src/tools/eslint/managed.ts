import { readFile } from 'node:fs/promises';
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

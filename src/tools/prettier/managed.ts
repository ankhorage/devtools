import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../shared/managedFiles.js';

const ESM_CONFIG = `export { default } from '@ankhorage/devtools/prettier';
`;
const COMMONJS_CONFIG = `module.exports = require('@ankhorage/devtools/prettier');
`;

export const prettierManagedFiles = [
  {
    relativePath: '.prettierrc.js',
    render: renderPrettierConfig,
  },
] as const satisfies readonly ManagedFileDefinition[];

async function renderPrettierConfig(targetDirectory: string): Promise<string> {
  return (await readPackageType(targetDirectory)) === 'module' ? ESM_CONFIG : COMMONJS_CONFIG;
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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEMPLATE_URL = new URL('./files/renovate.json5', import.meta.url);

/*** Render the current Renovate config while preserving supported repository-owned rules. */
export async function renderRenovateConfigAsync(targetDirectory: string): Promise<string> {
  const targetPath = join(targetDirectory, 'renovate.json5');
  let current: string;

  try {
    current = await readFile(targetPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return await readFile(TEMPLATE_URL, 'utf8');
    }
    throw error;
  }

  return current;
}

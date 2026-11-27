import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { isRecord } from '@ankhorage/utility/object';

/*** Read a repository package manifest, distinguishing an absent file from invalid JSON. */
export async function readPackageManifestAsync(
  targetDirectory: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const contents = await readFile(resolve(targetDirectory, 'package.json'), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('Expected package.json to contain a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

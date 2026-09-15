import { readFile } from 'node:fs/promises';

import { isRecord } from '@ankhorage/utility/object';

/*** Read a release-owned JSON object while rejecting malformed documents. */
export async function readApmReleaseManifestAsync(
  filePath: string,
): Promise<Readonly<Record<string, unknown>>> {
  const value: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!isRecord(value)) throw new Error('APM release document must contain a JSON object.');
  return value;
}

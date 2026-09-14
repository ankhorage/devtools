import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validatePackageUpdateMetadata } from '@ankhorage/apm';
import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

/*** Bind package-owned descriptor identity to the exact version selected by the release candidate. */
export async function synchronizeApmReleaseDescriptorAsync(
  targetDirectory: string,
): Promise<boolean> {
  const rootPath = resolve(targetDirectory);
  const packageJson = await readJsonRecordAsync(resolve(rootPath, 'package.json'));
  const metadataValidation = validatePackageUpdateMetadata(readApmMetadata(packageJson));
  if (!metadataValidation.valid) return false;

  const name = readOwnProperty(packageJson, 'name');
  const version = readOwnProperty(packageJson, 'version');
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('APM release candidate package.json must define a non-empty name.');
  }
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('APM release candidate package.json must define a non-empty version.');
  }

  const descriptorPath = resolve(rootPath, metadataValidation.metadata.descriptor.slice(2));
  const descriptor = await readJsonRecordAsync(descriptorPath);
  const owner = isRecord(descriptor.owner) ? descriptor.owner : {};
  const synchronized = { ...descriptor, owner: { ...owner, name, version } };
  await writeFile(descriptorPath, `${JSON.stringify(synchronized, null, 2)}\n`, 'utf8');
  return true;
}

/*** Read one JSON object from a release-candidate file. */
async function readJsonRecordAsync(filePath: string): Promise<Readonly<Record<string, unknown>>> {
  const value: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!isRecord(value)) throw new Error(`${filePath} must contain a JSON object.`);
  return value;
}

/*** Read opt-in APM package metadata without copying its schema. */
function readApmMetadata(packageJson: Readonly<Record<string, unknown>>): unknown {
  const ankh = readOwnProperty(packageJson, 'ankh');
  return isRecord(ankh) ? readOwnProperty(ankh, 'apm') : undefined;
}

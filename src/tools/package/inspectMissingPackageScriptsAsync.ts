import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { isRecord } from '@ankhorage/utility/object';

import type { ManagedFileStatus } from '../../features/managed-files/managedFiles.js';
import { isPublicPublishingPackage } from './isPublicPublishingPackage.js';
import { readPackageManifestAsync } from './readPackageManifestAsync.js';

/*** Identify project-owned required scripts that cannot be safely inferred by sync. */
export async function inspectMissingPackageScriptsAsync(
  targetDirectory: string,
): Promise<readonly ManagedFileStatus[]> {
  const manifest = await readPackageManifestAsync(targetDirectory);
  if (manifest === undefined) return [];
  if (!isPublicPublishingPackage(manifest)) return [];
  const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
  return REPOSITORY_RULE_METADATA.publicPackage.requiredScripts
    .filter(({ name }) => ['build', 'typecheck', 'test', 'docs'].includes(name))
    .filter(({ name }) => typeof scripts[name] !== 'string' || scripts[name].trim() === '')
    .map(({ name }) => ({ relativePath: `package.json#scripts.${name}`, state: 'missing' }));
}

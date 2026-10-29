import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';

/*** Resolve the central Atlas CI audit for repositories with analyzable source. */
export async function resolveAtlasAuditPolicyAsync(
  targetDirectory: string,
): Promise<AtlasAuditPolicy | undefined> {
  if (!(await hasSourceDirectoryAsync(targetDirectory))) return undefined;

  const { artifactName, artifactPath, command } = REPOSITORY_RULE_METADATA.atlasAudit;
  return { artifactName, artifactPath, command };
}

interface AtlasAuditPolicy {
  readonly artifactName: string;
  readonly artifactPath: string;
  readonly command: string;
}

/*** Detect whether the managed repository has a source tree that Atlas can inspect. */
async function hasSourceDirectoryAsync(targetDirectory: string): Promise<boolean> {
  try {
    return (await stat(join(targetDirectory, 'src'))).isDirectory();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

/*** Narrow filesystem failures to Node errors with stable error codes. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

/*** Resolve the central PKGViz CI audit for repositories with analyzable source. */
export async function resolvePkgvizAuditPolicyAsync(
  targetDirectory: string,
): Promise<PkgvizAuditPolicy | undefined> {
  if (!(await hasSourceDirectoryAsync(targetDirectory))) return undefined;

  const { artifactName, artifactPath, command } = REPOSITORY_POLICY.pkgvizAudit;
  return { artifactName, artifactPath, command };
}

interface PkgvizAuditPolicy {
  readonly artifactName: string;
  readonly artifactPath: string;
  readonly command: string;
}

/*** Detect whether the managed repository has a source tree that PKGViz can inspect. */
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

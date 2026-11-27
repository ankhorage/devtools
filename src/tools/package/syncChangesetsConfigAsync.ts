import type { ManagedFileSyncResult } from '../../features/managed-files/managedFiles.js';
import { inspectChangesetsConfigAsync } from './index.js';

/*** Initialize opted-in release repositories via the centrally installed Changesets CLI. */
export async function syncChangesetsConfigAsync(
  targetDirectory: string,
  dryRun: boolean,
  initialize: (directory: string) => Promise<void>,
): Promise<ManagedFileSyncResult | undefined> {
  const status = await inspectChangesetsConfigAsync(targetDirectory);
  if (status === undefined) return undefined;
  if (status.state === 'current') {
    return { relativePath: status.relativePath, action: 'unchanged' };
  }
  if (dryRun) return { relativePath: status.relativePath, action: 'would-create' };

  await initialize(targetDirectory);
  const initialized = await inspectChangesetsConfigAsync(targetDirectory);
  if (initialized?.state !== 'current') {
    throw new Error('Changesets init did not create .changeset/config.json.');
  }
  return { relativePath: status.relativePath, action: 'created' };
}

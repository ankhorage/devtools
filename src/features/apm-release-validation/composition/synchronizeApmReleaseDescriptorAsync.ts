import { createApmReleaseDescriptorPort } from '../adapters/outbound/createApmReleaseDescriptorPort.js';
import { synchronizeApmReleaseMetadataAsync } from '../application/synchronizeApmReleaseMetadataAsync.js';

/*** Compose descriptor version synchronization with the bounded Node filesystem adapter. */
export async function synchronizeApmReleaseDescriptorAsync(
  targetDirectory: string,
): Promise<boolean> {
  return synchronizeApmReleaseMetadataAsync(createApmReleaseDescriptorPort(targetDirectory));
}

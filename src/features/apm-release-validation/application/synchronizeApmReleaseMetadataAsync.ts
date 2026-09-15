import { validatePackageUpdateMetadata, validateUpdateDescriptor } from '@ankhorage/apm';
import { isRecord } from '@ankhorage/utility/object';

import type { ApmReleaseDescriptorPort } from '../../../types/apm-release-validation.js';
import { readApmReleaseMetadata } from '../utils/readApmReleaseMetadata.js';

/*** Bind valid owner metadata to the selected candidate version; never silently skip malformed opt-in. */
export async function synchronizeApmReleaseMetadataAsync(
  port: ApmReleaseDescriptorPort,
): Promise<boolean> {
  const manifest = await port.readPackageAsync();
  const metadata = readApmReleaseMetadata(manifest);
  if (metadata === undefined) return false;
  const discovery = validatePackageUpdateMetadata(metadata);
  if (!discovery.valid || discovery.metadata === undefined)
    throw new Error('Invalid APM discovery metadata.');
  const descriptor = await port.readDescriptorAsync(discovery.metadata.descriptor);
  const { name, version } = manifest;
  if (
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    !isRecord(descriptor.owner) ||
    descriptor.owner.name !== name
  ) {
    throw new Error('APM release descriptor must belong to the package being versioned.');
  }
  const synchronized = { ...descriptor, owner: { ...descriptor.owner, version } };
  const validation = validateUpdateDescriptor({
    descriptor: synchronized,
    expectedOwner: { name, version },
  });
  if (!validation.valid)
    throw new Error(validation.blockers.map(({ code, reason }) => `${code}: ${reason}`).join('\n'));
  return port.writeDescriptorAsync(discovery.metadata.descriptor, synchronized);
}

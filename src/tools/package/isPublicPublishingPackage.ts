import { isRecord } from '@ankhorage/utility/object';

/*** Recognize explicit public npm release intent without enrolling private applications. */
export function isPublicPublishingPackage(manifest: Record<string, unknown>): boolean {
  return (
    manifest.private !== true &&
    isRecord(manifest.publishConfig) &&
    manifest.publishConfig.access === 'public'
  );
}

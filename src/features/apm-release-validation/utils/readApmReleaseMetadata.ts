import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

/*** Read opt-in owner metadata without copying the APM discovery schema. */
export function readApmReleaseMetadata(manifest: Readonly<Record<string, unknown>>): unknown {
  const ankh = readOwnProperty(manifest, 'ankh');
  return isRecord(ankh) ? readOwnProperty(ankh, 'apm') : undefined;
}

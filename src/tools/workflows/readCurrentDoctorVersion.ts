import { readFileSync } from 'node:fs';

import { isRecord } from '@ankhorage/utility/object';
import { SEMVER_PATTERNS } from '@ankhorage/utility/semver';

const DOCTOR_PACKAGE_NAME = '@ankhorage/doctor';

/*** Read the exact Doctor version owned by the current Devtools package release. */
export function readCurrentDoctorVersion(): string {
  const parsed = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.devDependencies)) {
    throw new Error('Devtools package.json must define development dependencies.');
  }

  const version = parsed.devDependencies[DOCTOR_PACKAGE_NAME];
  if (typeof version !== 'string' || !SEMVER_PATTERNS.exactWithPrerelease.test(version)) {
    throw new Error(`Devtools must pin ${DOCTOR_PACKAGE_NAME} to one exact version.`);
  }
  return version;
}

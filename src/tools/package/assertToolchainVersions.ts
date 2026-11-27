import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { isRecord } from '@ankhorage/utility/object';
import { compareSemanticVersions, parseSemanticVersion } from '@ankhorage/utility/semver';

/*** Reject a synchronized toolchain plan that would lower an authored version floor. */
export function assertToolchainVersions(
  manifest: Record<string, unknown>,
  devtoolsVersion: string,
): void {
  const devDependencies = isRecord(manifest.devDependencies) ? manifest.devDependencies : {};
  const dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {};
  const { bun } = REPOSITORY_RULE_METADATA.runtime;
  assertVersionFloor('packageManager', manifest.packageManager, bun.packageManager);
  assertVersionFloor('@types/bun', devDependencies['@types/bun'], bun.typesRange);
  assertVersionFloor(
    '@ankhorage/devtools',
    devDependencies['@ankhorage/devtools'],
    devtoolsVersion,
  );
  assertVersionFloor('@ankhorage/devtools', dependencies['@ankhorage/devtools'], devtoolsVersion);
}

/*** Compare the stable floor of an authored toolchain declaration with the proposed version. */
function assertVersionFloor(name: string, existing: unknown, proposed: string): void {
  if (typeof existing !== 'string') return;
  const current = parseSemanticVersion(existing.replace(/^(?:bun@|[~^])/u, ''));
  const next = parseSemanticVersion(proposed.replace(/^(?:bun@|[~^])/u, ''));
  if (current !== null && next !== null && compareSemanticVersions(current, next) > 0) {
    throw new Error(
      `Cannot synchronize ${name} to ${proposed}: existing declaration ${existing} is newer.`,
    );
  }
}

import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';

/*** Apply the Rules-owned Bun runtime contract to one package manifest. */
export function applyBunRuntimePolicy(manifest: Record<string, unknown>): Record<string, unknown> {
  const devDependencies = toRecord(manifest.devDependencies);
  devDependencies['@types/bun'] = REPOSITORY_RULE_METADATA.runtime.bun.typesRange;

  return {
    ...manifest,
    packageManager: REPOSITORY_RULE_METADATA.runtime.bun.packageManager,
    devDependencies,
  };
}

/*** Narrow an unknown JSON-like value to a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Copy a JSON-like value to a mutable record or return an empty record. */
function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

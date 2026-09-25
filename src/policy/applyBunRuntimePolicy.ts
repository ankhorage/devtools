import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

/*** Apply the canonical Bun runtime policy to one package manifest. */
export function applyBunRuntimePolicy(manifest: Record<string, unknown>): Record<string, unknown> {
  const devDependencies = toRecord(manifest.devDependencies);
  devDependencies['@types/bun'] = REPOSITORY_POLICY.runtime.bun.typesRange;

  return {
    ...manifest,
    packageManager: REPOSITORY_POLICY.runtime.bun.packageManager,
    devDependencies,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

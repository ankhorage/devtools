import { DEVTOOLS_BUN_RUNTIME_POLICY } from './bunRuntimePolicy.js';

/*** Apply the Devtools-owned Bun runtime policy to one package manifest. */
export function applyBunRuntimePolicy(manifest: Record<string, unknown>): Record<string, unknown> {
  const devDependencies = toRecord(manifest.devDependencies);
  devDependencies['@types/bun'] = DEVTOOLS_BUN_RUNTIME_POLICY.typesRange;

  return {
    ...manifest,
    packageManager: DEVTOOLS_BUN_RUNTIME_POLICY.packageManager,
    devDependencies,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

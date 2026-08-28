export function applyBunRuntimePolicy(
  manifest: Record<string, unknown>,
  policy: { readonly packageManager: string; readonly typesRange: string },
): Record<string, unknown> {
  const devDependencies = toRecord(manifest.devDependencies);
  devDependencies['@types/bun'] = policy.typesRange;

  return {
    ...manifest,
    packageManager: policy.packageManager,
    devDependencies,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

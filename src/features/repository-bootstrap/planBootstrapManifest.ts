import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

const defaults = {
  build: 'tsc -p tsconfig.build.json',
  typecheck: 'tsc --noEmit -p tsconfig.json',
  test: 'bun test',
  docs: 'paradox',
} as const;

/*** Plan manifest additions for a standalone package with an authored source entrypoint. */
export function planBootstrapManifest(
  manifest: Record<string, unknown>,
  toolchain: Record<string, unknown>,
): Record<string, unknown> {
  const policy = REPOSITORY_RULE_METADATA.publicPackage;
  if (
    manifest.private === true ||
    !isRecord(manifest.publishConfig) ||
    manifest.publishConfig.access !== policy.publishAccess.value
  ) {
    throw new Error(
      'Set publishConfig.access to public explicitly to initialize a publishable package.',
    );
  }

  const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
  const dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {};
  const devDependencies = isRecord(manifest.devDependencies) ? manifest.devDependencies : {};
  const planned = {
    type: policy.packageType.value,
    ...(scripts.build === undefined
      ? {
          files: ['dist'],
          exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
        }
      : {}),
    ...manifest,
  };
  assertAuthoredFields(planned);
  if (
    (manifest.type !== undefined && manifest.type !== policy.packageType.value) ||
    manifest.workspaces !== undefined
  ) {
    throw new Error('Initialization supports standalone Node ESM TypeScript packages.');
  }

  return {
    ...planned,
    scripts: { ...defaults, ...scripts },
    devDependencies: {
      ...Object.fromEntries(
        Object.entries(toolchain).filter(
          ([name]) =>
            ['typescript', '@types/node', '@ankhorage/paradox'].includes(name) &&
            readOwnProperty(dependencies, name) === undefined &&
            readOwnProperty(devDependencies, name) === undefined,
        ),
      ),
      ...devDependencies,
    },
  };
}

/*** Report absent owner inputs using the Rules-owned field list. */
function assertAuthoredFields(planned: Record<string, unknown>): void {
  const missing = REPOSITORY_RULE_METADATA.publicPackage.requiredFields.filter(({ name }) => {
    const value = Object.entries(planned).find(([key]) => key === name)?.[1];
    return value === undefined || value === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Supply authored package.json fields: ${missing.map(({ name }) => name).join(', ')}.`,
    );
  }
}

/***
 * Synchronize the consumer `package.json` contract owned by `@ankhorage/devtools`.
 *
 * Package synchronization is merge-aware. It installs the current `@ankhorage/devtools` version
 * as a development dependency for normal consumers, while `@ankhorage/ankh` keeps devtools as a
 * runtime dependency because the CLI loads it as a bundled core provider. Individually installed
 * toolchain packages that devtools now owns are removed, and the canonical `lint`, `lint:fix`,
 * `format`, `format:check`, and `knip` scripts are written.
 * Unrelated manifest fields, scripts, dependencies, and metadata are preserved.
 *
 * The Bun runtime policy is shared by every repository, including devtools itself. Devtools skips
 * only its consumer dependency/script normalization so it never attempts to install itself.
 *
 * Status compares only the fields owned by this contract, so unrelated repository customization
 * does not count as drift. `--dry-run` reports whether `package.json` would be created or updated
 * without writing it, and repeated synchronization is idempotent.
 *
 * @readme
 */
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { bunRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileStatus, ManagedFileSyncResult } from '../shared/managedFiles.js';

const PACKAGE_PATH = 'package.json';
const DEVTOOLS_PACKAGE_NAME = '@ankhorage/devtools';
const ANKH_PACKAGE_NAME = '@ankhorage/ankh';
const BUN_TYPES_PACKAGE_NAME = '@types/bun';

const STANDARD_SCRIPTS = {
  lint: 'ankhorage-eslint . --max-warnings=0',
  'lint:fix': 'ankhorage-eslint . --fix --max-warnings=0',
  format: 'ankhorage-prettier --write .',
  'format:check': 'ankhorage-prettier --check .',
  knip: 'ankhorage-knip',
} as const;

const DEVTOOLS_OWNED_DEV_DEPENDENCIES = [
  '@eslint/js',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-import',
  'eslint-plugin-prettier',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-native',
  'eslint-plugin-security',
  'eslint-plugin-simple-import-sort',
  'eslint-plugin-unused-imports',
  'knip',
  'prettier',
  'typescript-eslint',
] as const;

interface PackageManifestSnapshot {
  readonly exists: boolean;
  readonly manifest: Record<string, unknown>;
}

export async function inspectPackageManifest(
  targetDirectory: string,
  devtoolsVersion: string,
): Promise<ManagedFileStatus> {
  const snapshot = await readPackageManifest(targetDirectory);
  if (!snapshot.exists) {
    return { relativePath: PACKAGE_PATH, state: 'missing' };
  }

  return {
    relativePath: PACKAGE_PATH,
    state: isManagedPackageContractCurrent(snapshot.manifest, devtoolsVersion)
      ? 'current'
      : 'outdated',
  };
}

export async function syncPackageManifest(
  targetDirectory: string,
  devtoolsVersion: string,
  options: { readonly dryRun: boolean },
): Promise<ManagedFileSyncResult> {
  const snapshot = await readPackageManifest(targetDirectory);
  if (snapshot.exists && isManagedPackageContractCurrent(snapshot.manifest, devtoolsVersion)) {
    return { relativePath: PACKAGE_PATH, action: 'unchanged' };
  }

  if (options.dryRun) {
    return {
      relativePath: PACKAGE_PATH,
      action: snapshot.exists ? 'would-update' : 'would-create',
    };
  }

  const updatedManifest = applyManagedPackageContract(snapshot.manifest, devtoolsVersion);
  await writeFile(
    resolve(targetDirectory, PACKAGE_PATH),
    serializePackageManifest(updatedManifest),
    'utf8',
  );
  return {
    relativePath: PACKAGE_PATH,
    action: snapshot.exists ? 'updated' : 'created',
  };
}

export function applyManagedPackageContract(
  manifest: Record<string, unknown>,
  devtoolsVersion: string,
): Record<string, unknown> {
  if (manifest.name === DEVTOOLS_PACKAGE_NAME) {
    return applyBunRuntimePolicy(manifest);
  }

  const scripts = { ...toRecord(manifest.scripts), ...STANDARD_SCRIPTS };
  const devDependencies = removeOwnedDependencies(toRecord(manifest.devDependencies));
  const dependencies = toRecord(manifest.dependencies);

  applyDevtoolsDependencyPlacement(manifest, dependencies, devDependencies, devtoolsVersion);

  return applyBunRuntimePolicy({
    ...manifest,
    ...normalizedDependencies(manifest, dependencies),
    scripts,
    devDependencies,
  });
}

export function isManagedPackageContractCurrent(
  manifest: Record<string, unknown>,
  devtoolsVersion: string,
): boolean {
  if (!hasCurrentBunRuntimePolicy(manifest)) {
    return false;
  }
  if (manifest.name === DEVTOOLS_PACKAGE_NAME) {
    return true;
  }

  const scripts = toRecord(manifest.scripts);
  const devDependencies = toRecord(manifest.devDependencies);
  const dependencies = toRecord(manifest.dependencies);

  return (
    hasStandardScripts(scripts) &&
    DEVTOOLS_OWNED_DEV_DEPENDENCIES.every((name) => devDependencies[name] === undefined) &&
    hasCurrentDevtoolsDependencyPlacement(manifest, dependencies, devDependencies, devtoolsVersion)
  );
}

export function readCurrentDevtoolsVersion(): string {
  const parsed = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as unknown;
  if (!isRecord(parsed) || typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error('Devtools package.json must define a non-empty version string.');
  }
  return parsed.version;
}

async function readPackageManifest(targetDirectory: string): Promise<PackageManifestSnapshot> {
  try {
    const contents = await readFile(resolve(targetDirectory, PACKAGE_PATH), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`Expected ${PACKAGE_PATH} to contain a JSON object.`);
    }
    return { exists: true, manifest: parsed };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { exists: false, manifest: {} };
    }
    throw error;
  }
}

function applyBunRuntimePolicy(manifest: Record<string, unknown>): Record<string, unknown> {
  const devDependencies = toRecord(manifest.devDependencies);
  devDependencies[BUN_TYPES_PACKAGE_NAME] = bunRuntimePolicy.typesRange;
  return {
    ...manifest,
    packageManager: bunRuntimePolicy.packageManager,
    devDependencies,
  };
}

function hasCurrentBunRuntimePolicy(manifest: Record<string, unknown>): boolean {
  const devDependencies = toRecord(manifest.devDependencies);
  return (
    manifest.packageManager === bunRuntimePolicy.packageManager &&
    devDependencies[BUN_TYPES_PACKAGE_NAME] === bunRuntimePolicy.typesRange
  );
}

function applyDevtoolsDependencyPlacement(
  manifest: Record<string, unknown>,
  dependencies: Record<string, unknown>,
  devDependencies: Record<string, unknown>,
  devtoolsVersion: string,
): void {
  const versionRange = `^${devtoolsVersion}`;
  if (manifest.name === ANKH_PACKAGE_NAME) {
    dependencies[DEVTOOLS_PACKAGE_NAME] = versionRange;
    delete devDependencies[DEVTOOLS_PACKAGE_NAME];
    return;
  }

  devDependencies[DEVTOOLS_PACKAGE_NAME] = versionRange;
  delete dependencies[DEVTOOLS_PACKAGE_NAME];
}

function hasCurrentDevtoolsDependencyPlacement(
  manifest: Record<string, unknown>,
  dependencies: Record<string, unknown>,
  devDependencies: Record<string, unknown>,
  devtoolsVersion: string,
): boolean {
  const versionRange = `^${devtoolsVersion}`;
  if (manifest.name === ANKH_PACKAGE_NAME) {
    return (
      dependencies[DEVTOOLS_PACKAGE_NAME] === versionRange &&
      devDependencies[DEVTOOLS_PACKAGE_NAME] === undefined
    );
  }

  return (
    devDependencies[DEVTOOLS_PACKAGE_NAME] === versionRange &&
    dependencies[DEVTOOLS_PACKAGE_NAME] === undefined
  );
}

function removeOwnedDependencies(
  devDependencies: Record<string, unknown>,
): Record<string, unknown> {
  for (const dependencyName of DEVTOOLS_OWNED_DEV_DEPENDENCIES) {
    delete devDependencies[dependencyName];
  }
  return devDependencies;
}

function normalizedDependencies(
  manifest: Record<string, unknown>,
  dependencies: Record<string, unknown>,
): Record<string, unknown> {
  return Object.keys(dependencies).length === 0 && manifest.dependencies === undefined
    ? {}
    : { dependencies };
}

function hasStandardScripts(scripts: Record<string, unknown>): boolean {
  return Object.entries(STANDARD_SCRIPTS).every(([name, command]) => scripts[name] === command);
}

function serializePackageManifest(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

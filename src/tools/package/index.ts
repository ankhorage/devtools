/***
 * Synchronize the consumer `package.json` contract owned by `@ankhorage/devtools`.
 *
 * Package synchronization is merge-aware. It installs the current `@ankhorage/devtools` version
 * as a development dependency for every consumer, including `@ankhorage/ankh`. Individually
 * installed toolchain packages that devtools now owns are removed, and the canonical `lint`,
 * `lint:fix`, `format`, `format:check`, and `knip:check` scripts are written.
 * Unrelated manifest fields, scripts, dependencies, and metadata are preserved.
 *
 * The Bun runtime synchronization contract is Devtools-owned for every repository, including
 * Devtools itself. Devtools skips only its consumer dependency/script normalization so it never
 * attempts to install itself.
 *
 * Status compares only the fields owned by this contract, so unrelated repository customization
 * does not count as drift. `--dry-run` reports whether `package.json` would be created or updated
 * without writing it, and repeated synchronization is idempotent.
 *
 * @readme
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

import { applyBunRuntimePolicy } from '../../policy/applyBunRuntimePolicy.js';
import { DEVTOOLS_BUN_RUNTIME_POLICY } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileStatus, ManagedFileSyncResult } from '../shared/managedFiles.js';

const PACKAGE_PATH = 'package.json';
const DEVTOOLS_PACKAGE_NAME = '@ankhorage/devtools';
const BUN_TYPES_PACKAGE_NAME = '@types/bun';
const CHANGESETS_CONFIG_PATH = '.changeset/config.json';

const STANDARD_SCRIPTS = {
  lint: 'ankhorage-eslint . --max-warnings=0',
  'lint:fix': 'ankhorage-eslint . --fix --max-warnings=0',
  format: 'ankhorage-prettier --write .',
  'format:check': 'ankhorage-prettier --check .',
  'knip:check': 'ankhorage-knip',
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
  readonly changesetsConfigExists: boolean;
  readonly exists: boolean;
  readonly manifest: Record<string, unknown>;
}

/*** Inspect whether the Devtools-owned package manifest contract is current. */
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
    state: isManagedPackageContractCurrent(
      snapshot.manifest,
      devtoolsVersion,
      snapshot.changesetsConfigExists,
    )
      ? 'current'
      : 'outdated',
  };
}

/*** Synchronize the Devtools-owned package manifest fields. */
export async function syncPackageManifest(
  targetDirectory: string,
  devtoolsVersion: string,
  options: { readonly dryRun: boolean },
): Promise<ManagedFileSyncResult> {
  const snapshot = await readPackageManifest(targetDirectory);
  if (
    snapshot.exists &&
    isManagedPackageContractCurrent(
      snapshot.manifest,
      devtoolsVersion,
      snapshot.changesetsConfigExists,
    )
  ) {
    return { relativePath: PACKAGE_PATH, action: 'unchanged' };
  }

  if (options.dryRun) {
    return {
      relativePath: PACKAGE_PATH,
      action: snapshot.exists ? 'would-update' : 'would-create',
    };
  }

  const updatedManifest = applyManagedPackageContract(
    snapshot.manifest,
    devtoolsVersion,
    snapshot.changesetsConfigExists,
  );
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

/*** Apply the Devtools-owned package scripts, dependencies, and Bun runtime policy. */
export function applyManagedPackageContract(
  manifest: Record<string, unknown>,
  devtoolsVersion: string,
  changesetsConfigExists = false,
): Record<string, unknown> {
  if (manifest.name === DEVTOOLS_PACKAGE_NAME) {
    return applyBunRuntimePolicy(manifest);
  }

  const scripts = { ...toRecord(manifest.scripts) };
  const changesetsEnabled = isChangesetsEnabled(scripts, changesetsConfigExists);
  delete scripts.knip;
  Object.assign(scripts, STANDARD_SCRIPTS);
  if (changesetsEnabled) {
    Object.assign(scripts, REPOSITORY_POLICY.changesets.packageScripts);
  }
  const devDependencies = removeOwnedDependencies(toRecord(manifest.devDependencies));
  const dependencies = toRecord(manifest.dependencies);
  delete dependencies[REPOSITORY_POLICY.changesets.packageName];
  delete devDependencies[REPOSITORY_POLICY.changesets.packageName];

  applyDevtoolsDependencyPlacement(dependencies, devDependencies, devtoolsVersion);

  return applyBunRuntimePolicy({
    ...manifest,
    ...normalizedDependencies(manifest, dependencies),
    scripts,
    devDependencies,
  });
}

/*** Check whether the Devtools-owned package manifest fields match current policy. */
export function isManagedPackageContractCurrent(
  manifest: Record<string, unknown>,
  devtoolsVersion: string,
  changesetsConfigExists = false,
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
  const changesetsEnabled = isChangesetsEnabled(scripts, changesetsConfigExists);

  return (
    hasStandardScripts(scripts) &&
    DEVTOOLS_OWNED_DEV_DEPENDENCIES.every((name) => devDependencies[name] === undefined) &&
    dependencies[REPOSITORY_POLICY.changesets.packageName] === undefined &&
    devDependencies[REPOSITORY_POLICY.changesets.packageName] === undefined &&
    hasCurrentChangesetsScripts(scripts, changesetsEnabled) &&
    hasCurrentDevtoolsDependencyPlacement(dependencies, devDependencies, devtoolsVersion)
  );
}

/*** Read the current Devtools package version used for consumer synchronization. */
export function readCurrentDevtoolsVersion(): string {
  const parsed = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as unknown;
  if (!isRecord(parsed) || typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error('Devtools package.json must define a non-empty version string.');
  }
  return parsed.version;
}

/*** Read one package manifest snapshot and Changesets applicability state. */
async function readPackageManifest(targetDirectory: string): Promise<PackageManifestSnapshot> {
  const changesetsConfigExists = existsSync(resolve(targetDirectory, CHANGESETS_CONFIG_PATH));
  try {
    const contents = await readFile(resolve(targetDirectory, PACKAGE_PATH), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`Expected ${PACKAGE_PATH} to contain a JSON object.`);
    }
    return { changesetsConfigExists, exists: true, manifest: parsed };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { changesetsConfigExists, exists: false, manifest: {} };
    }
    throw error;
  }
}

/*** Check the Bun package manager and Bun type dependency contract. */
function hasCurrentBunRuntimePolicy(manifest: Record<string, unknown>): boolean {
  const devDependencies = toRecord(manifest.devDependencies);
  return (
    manifest.packageManager === DEVTOOLS_BUN_RUNTIME_POLICY.packageManager &&
    devDependencies[BUN_TYPES_PACKAGE_NAME] === DEVTOOLS_BUN_RUNTIME_POLICY.typesRange
  );
}

/*** Place Devtools in development dependencies for every consuming repository. */
function applyDevtoolsDependencyPlacement(
  dependencies: Record<string, unknown>,
  devDependencies: Record<string, unknown>,
  devtoolsVersion: string,
): void {
  devDependencies[DEVTOOLS_PACKAGE_NAME] = `^${devtoolsVersion}`;
  delete dependencies[DEVTOOLS_PACKAGE_NAME];
}

/*** Check that Devtools is development-only at the current synchronized version. */
function hasCurrentDevtoolsDependencyPlacement(
  dependencies: Record<string, unknown>,
  devDependencies: Record<string, unknown>,
  devtoolsVersion: string,
): boolean {
  return (
    devDependencies[DEVTOOLS_PACKAGE_NAME] === `^${devtoolsVersion}` &&
    dependencies[DEVTOOLS_PACKAGE_NAME] === undefined
  );
}

/*** Remove direct development dependencies owned by the Devtools package. */
function removeOwnedDependencies(
  devDependencies: Record<string, unknown>,
): Record<string, unknown> {
  for (const dependencyName of DEVTOOLS_OWNED_DEV_DEPENDENCIES) {
    delete devDependencies[dependencyName];
  }
  return devDependencies;
}

/*** Preserve an existing dependencies object or omit a newly empty one. */
function normalizedDependencies(
  manifest: Record<string, unknown>,
  dependencies: Record<string, unknown>,
): Record<string, unknown> {
  return Object.keys(dependencies).length === 0 && manifest.dependencies === undefined
    ? {}
    : { dependencies };
}

/*** Check the canonical development-tool scripts. */
function hasStandardScripts(scripts: Record<string, unknown>): boolean {
  return (
    scripts.knip === undefined &&
    Object.entries(STANDARD_SCRIPTS).every(([name, command]) => scripts[name] === command)
  );
}

/*** Check Changesets scripts when the repository participates in Changesets. */
function hasCurrentChangesetsScripts(
  scripts: Record<string, unknown>,
  changesetsEnabled: boolean,
): boolean {
  return (
    !changesetsEnabled ||
    Object.entries(REPOSITORY_POLICY.changesets.packageScripts).every(
      ([name, command]) => scripts[name] === command,
    )
  );
}

/*** Determine whether the repository participates in Changesets synchronization. */
function isChangesetsEnabled(
  scripts: Record<string, unknown>,
  changesetsConfigExists: boolean,
): boolean {
  return (
    changesetsConfigExists ||
    Object.keys(REPOSITORY_POLICY.changesets.packageScripts).some(
      (scriptName) => scripts[scriptName] !== undefined,
    )
  );
}

/*** Serialize a package manifest using the repository formatting contract. */
function serializePackageManifest(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/*** Copy a JSON-like value to a mutable record or return an empty record. */
function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

/*** Narrow an unknown JSON-like value to a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Narrow an unknown error to a Node error carrying an error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

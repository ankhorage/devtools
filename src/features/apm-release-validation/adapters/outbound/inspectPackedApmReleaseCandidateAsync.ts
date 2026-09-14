import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { validatePackageUpdateMetadata } from '@ankhorage/apm';
import type { ApmUpdateExtension } from '@ankhorage/apm/types';
import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

import type { ApmPackedReleaseCandidate } from '../../../../types/apm-release-validation';

const execFileAsync = promisify(execFile);

/*** Pack one exact release candidate and load only the APM evidence shipped inside that tarball. */
export async function inspectPackedApmReleaseCandidateAsync(
  targetDirectory: string,
): Promise<ApmPackedReleaseCandidate> {
  const rootPath = resolve(targetDirectory);
  const temporaryRoot = await mkdtemp(resolve(rootPath, '.ankh-apm-release-'));
  const tarballPath = resolve(temporaryRoot, 'candidate.tgz');
  const extractRoot = resolve(temporaryRoot, 'extract');

  try {
    await execFileAsync(
      'bun',
      ['pm', 'pack', '--filename', tarballPath, '--ignore-scripts', '--quiet'],
      { cwd: rootPath },
    );
    await execFileAsync('mkdir', ['-p', extractRoot], { cwd: rootPath });
    await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractRoot], { cwd: rootPath });

    const packageRoot = resolve(extractRoot, 'package');
    const packageJson = await readJsonRecordAsync(resolve(packageRoot, 'package.json'));
    const metadataValidation = validatePackageUpdateMetadata(readApmMetadata(packageJson));
    if (!metadataValidation.valid) {
      return {
        packageJson,
        descriptor: undefined,
        descriptorSource: '',
        integrity: await tarballIntegrityAsync(tarballPath),
      };
    }

    const descriptorPath = resolvePackagePath(packageRoot, metadataValidation.metadata.descriptor);
    const descriptorSource = await readFile(descriptorPath, 'utf8');
    const descriptor: unknown = JSON.parse(descriptorSource);
    const extensionSubpath = readExtensionSubpath(descriptor);
    const extension =
      extensionSubpath === undefined
        ? undefined
        : await loadPackedExtensionAsync(packageRoot, packageJson, extensionSubpath);

    return {
      packageJson,
      descriptor,
      descriptorSource,
      integrity: await tarballIntegrityAsync(tarballPath),
      ...(extension === undefined ? {} : { extension }),
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

/*** Read one package JSON object from the packed candidate. */
async function readJsonRecordAsync(filePath: string): Promise<Readonly<Record<string, unknown>>> {
  const value: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!isRecord(value)) throw new Error(`Packed ${filePath} must contain a JSON object.`);
  return value;
}

/*** Read the package's opt-in APM metadata without interpreting its schema locally. */
function readApmMetadata(packageJson: Readonly<Record<string, unknown>>): unknown {
  const ankh = readOwnProperty(packageJson, 'ankh');
  return isRecord(ankh) ? readOwnProperty(ankh, 'apm') : undefined;
}

/*** Resolve a validator-approved package-relative path inside the packed package root. */
function resolvePackagePath(packageRoot: string, subpath: string): string {
  return resolve(packageRoot, subpath.slice(2));
}

/*** Read an optional executable extension export from untrusted descriptor JSON. */
function readExtensionSubpath(descriptor: unknown): string | undefined {
  if (!isRecord(descriptor) || !isRecord(descriptor.extension)) return undefined;
  return typeof descriptor.extension.export === 'string' ? descriptor.extension.export : undefined;
}

/*** Import the exact extension file referenced by the packed package export map. */
async function loadPackedExtensionAsync(
  packageRoot: string,
  packageJson: Readonly<Record<string, unknown>>,
  subpath: string,
): Promise<ApmUpdateExtension | undefined> {
  const target = resolveExportTarget(readOwnProperty(packageJson, 'exports'), subpath);
  if (target === undefined) return undefined;
  const module: unknown = await import(pathToFileURL(resolvePackagePath(packageRoot, target)).href);
  if (!isRecord(module)) return undefined;
  const value = readOwnProperty(module, 'default');
  return isRecord(value) ? (value as ApmUpdateExtension) : undefined;
}

/*** Resolve one public package export target for ESM validation. */
function resolveExportTarget(exportsValue: unknown, subpath: string): string | undefined {
  if (!isRecord(exportsValue)) return undefined;
  const entry = readOwnProperty(exportsValue, subpath);
  if (typeof entry === 'string') return isPackageSubpath(entry) ? entry : undefined;
  if (!isRecord(entry)) return undefined;
  const importTarget = readOwnProperty(entry, 'import');
  if (typeof importTarget === 'string' && isPackageSubpath(importTarget)) return importTarget;
  const defaultTarget = readOwnProperty(entry, 'default');
  return typeof defaultTarget === 'string' && isPackageSubpath(defaultTarget)
    ? defaultTarget
    : undefined;
}

/*** Accept only traversal-free package-local export paths. */
function isPackageSubpath(value: string): boolean {
  return value.startsWith('./') && !value.split('/').includes('..');
}

/*** Bind validation to the exact bytes of the packed release candidate. */
async function tarballIntegrityAsync(tarballPath: string): Promise<string> {
  const contents = await readFile(tarballPath);
  return `sha512-${createHash('sha512').update(contents).digest('base64')}`;
}

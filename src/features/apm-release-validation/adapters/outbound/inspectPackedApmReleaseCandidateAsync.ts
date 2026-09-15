import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { validatePackageUpdateMetadata, validateUpdateDescriptor } from '@ankhorage/apm';
import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type {
  ApmPackedReleaseCandidate,
  ApmReleaseValidationOptions,
  ApmReleaseValidationResult,
} from '../../../../types/apm-release-validation.js';
import { validateApmReleaseCandidate } from '../../application/validateApmReleaseCandidate.js';
import { readApmReleaseMetadata } from '../../utils/readApmReleaseMetadata.js';
import { probePackedApmExtensionAsync } from './probePackedApmExtensionAsync.js';
import { readApmReleaseManifestAsync } from './readApmReleaseManifestAsync.js';

/*** Validate the actual script-free packed candidate outside the checkout, retaining only accepted bytes. */
export async function inspectPackedApmReleaseCandidateAsync(
  targetDirectory: string,
  options: ApmReleaseValidationOptions = {},
): Promise<ApmReleaseValidationResult> {
  const root = await realpath(targetDirectory);
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'ankh-apm-release-'));
  try {
    const archive = resolve(temporaryRoot, 'candidate.tgz');
    const packageRoot = resolve(temporaryRoot, 'package');
    await packCandidateAsync(root, temporaryRoot, archive);
    const candidate = await readPackedCandidateAsync(packageRoot, archive);
    const result = await validatePackedCandidateAsync(candidate, packageRoot, root, options);
    if (!result.valid || options.artifactPath === undefined) return result;
    const artifactPath = resolve(options.artifactPath);
    if (artifactPath === archive)
      throw new Error('Artifact output must survive temporary validation cleanup.');
    await mkdir(resolve(artifactPath, '..'), { recursive: true });
    await copyFile(archive, artifactPath, constants.COPYFILE_EXCL);
    return { ...result, artifactPath };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

/*** Build and extract only a script-free local package archive under a separate temporary root. */
async function packCandidateAsync(
  root: string,
  temporaryRoot: string,
  archive: string,
): Promise<void> {
  await execFileAsync('bun', ['pm', 'pack', '--filename', archive, '--ignore-scripts', '--quiet'], {
    cwd: root,
    ...PROCESS_LIMITS,
  });
  const { stdout } = await execFileAsync('tar', ['-tzf', archive], PROCESS_LIMITS);
  for (const entry of stdout.trim().split('\n')) {
    if (!entry.startsWith('package/'))
      throw new Error('Packed file is outside the package prefix.');
    resolvePathWithinRoot(temporaryRoot, entry);
  }
  await execFileAsync(
    'tar',
    ['-xzf', archive, '-C', temporaryRoot, '--no-same-owner', '--no-same-permissions'],
    PROCESS_LIMITS,
  );
}

/*** Read owner metadata strictly from the archive, not the source-tree descriptor. */
async function readPackedCandidateAsync(
  packageRoot: string,
  archive: string,
): Promise<ApmPackedReleaseCandidate> {
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(archive))
    .digest('base64')}`;
  const packageJson = await readApmReleaseManifestAsync(resolve(packageRoot, 'package.json'));
  const discovery = validatePackageUpdateMetadata(readApmReleaseMetadata(packageJson));
  if (!discovery.valid || discovery.metadata === undefined) {
    return { packageJson, integrity, descriptor: undefined, descriptorSource: '' };
  }
  const descriptorPath = await realpath(
    resolvePathWithinRoot(packageRoot, discovery.metadata.descriptor),
  );
  resolvePathWithinRoot(packageRoot, relative(packageRoot, descriptorPath));
  const descriptorSource = await readFile(descriptorPath, 'utf8');
  const descriptor: unknown = JSON.parse(descriptorSource);
  return { packageJson, descriptor, descriptorSource, integrity };
}

/*** Require valid static evidence before optionally loading the exact packed owner extension. */
async function validatePackedCandidateAsync(
  candidate: ApmPackedReleaseCandidate,
  packageRoot: string,
  root: string,
  options: ApmReleaseValidationOptions,
): Promise<ApmReleaseValidationResult> {
  const validation = validateUpdateDescriptor({ descriptor: candidate.descriptor });
  const staticResult = validateApmReleaseCandidate(candidate, options);
  const onlyExtensionMissing = staticResult.blockers.every((blocker) =>
    blocker.startsWith('protocol.extension-binding-mismatch:'),
  );
  const extension = validation.descriptor?.extension;
  return extension !== undefined && validation.valid && onlyExtensionMissing
    ? probePackedApmExtensionAsync({
        candidate,
        packageRoot,
        dependencyRoot: resolve(root, 'node_modules'),
        subpath: extension.export,
        options,
      })
    : staticResult;
}

const execFileAsync = promisify(execFile);
const PROCESS_LIMITS = { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 } as const;

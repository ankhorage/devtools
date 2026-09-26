import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

import { resolveApmReleaseCommandAsync } from '../features/apm-release-validation/adapters/outbound/resolveApmReleaseCommandAsync.js';
import { resolveStructureReleaseCommandAsync } from '../features/structure-descriptor-generation/adapters/outbound/resolveStructureReleaseCommandAsync.js';
import { applyBunRuntimePolicy } from '../policy/applyBunRuntimePolicy.js';
import { DEVTOOLS_BUN_RUNTIME_POLICY } from '../policy/bunRuntimePolicy.js';
import { renderBunPolicyDocumentation } from '../policy/renderBunPolicyDocumentation.js';
import { readCurrentDoctorVersion } from '../tools/workflows/readCurrentDoctorVersion.js';
import { renderRenovateWorkflowAsync } from '../tools/workflows/renderRenovateWorkflowAsync.js';
import {
  renderWorkflowAsync,
  type WorkflowPolicy,
} from '../tools/workflows/renderWorkflowAsync.js';

/*** Synchronize or validate Renovate-owned Devtools artifacts from Devtools-owned policy. */
export async function synchronizeRenovateOwnerAsync(
  operation: OwnerSyncOperation,
  targetDirectory: string,
  options: OwnerSyncOptions = {},
): Promise<void> {
  const target = resolve(targetDirectory);
  const definitions = await createManagedDefinitionsAsync(target);
  await assertDevtoolsTargetAsync(target);

  if (operation === 'sync') {
    await syncDefinitionsAsync(target, definitions);
    await (options.runLockfileAsync ?? runBunLockfileAsync)(operation, target);
  }

  const outdatedPaths = await getOutdatedPathsAsync(target, definitions);
  if (outdatedPaths.length > 0) {
    throw new Error(`Stale Devtools owner policy artifacts: ${outdatedPaths.join(', ')}`);
  }

  if (operation === 'status') {
    await (options.runLockfileAsync ?? runBunLockfileAsync)(operation, target);
  }
}

type OwnerSyncOperation = 'status' | 'sync';

interface ManagedDefinition {
  readonly contents: string;
  readonly relativePath: string;
}

interface OwnerSyncOptions {
  readonly runLockfileAsync?: (
    operation: OwnerSyncOperation,
    targetDirectory: string,
  ) => Promise<void>;
}

/*** Assert that Renovate owner synchronization targets the Devtools repository. */
async function assertDevtoolsTargetAsync(targetDirectory: string): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve(targetDirectory, 'package.json'), 'utf8'),
  ) as unknown;
  if (!isRecord(manifest) || manifest.name !== '@ankhorage/devtools') {
    throw new Error('The Renovate owner sync target must be @ankhorage/devtools.');
  }
}

/*** Build the owner-managed artifact definitions from released central policy. */
async function createManagedDefinitionsAsync(
  targetDirectory: string,
): Promise<readonly ManagedDefinition[]> {
  const manifest = JSON.parse(
    await readFile(resolve(targetDirectory, 'package.json'), 'utf8'),
  ) as unknown;
  if (!isRecord(manifest)) {
    throw new Error('Devtools package.json must contain a JSON object.');
  }

  const readme = await readFile(resolve(targetDirectory, 'README.md'), 'utf8');
  const workflowPolicy = await createWorkflowPolicyAsync(targetDirectory);

  return [
    {
      relativePath: 'package.json',
      contents: serializePackageManifest(applyBunRuntimePolicy(manifest)),
    },
    {
      relativePath: '.github/workflows/ci.yml',
      contents: await renderWorkflowAsync(
        new URL('../tools/workflows/files/ci.yml', import.meta.url),
        workflowPolicy,
      ),
    },
    {
      relativePath: '.github/workflows/release.yml',
      contents: await renderWorkflowAsync(
        new URL('../tools/workflows/files/release.yml', import.meta.url),
        workflowPolicy,
      ),
    },
    {
      relativePath: '.github/workflows/renovate.yml',
      contents: await renderRenovateWorkflowAsync(
        new URL('../tools/workflows/files/renovate.yml', import.meta.url),
        targetDirectory,
        workflowPolicy,
      ),
    },
    {
      relativePath: 'README.md',
      contents: renderBunPolicyDocumentation(readme),
    },
  ];
}

/*** Build the self-hosted workflow policy used by Devtools owner synchronization. */
async function createWorkflowPolicyAsync(targetDirectory: string): Promise<WorkflowPolicy> {
  return {
    apmReleaseCommand: await resolveApmReleaseCommandAsync(targetDirectory),
    structureReleaseCommand: await resolveStructureReleaseCommandAsync(targetDirectory),
    bunVersion: DEVTOOLS_BUN_RUNTIME_POLICY.version,
    doctorVersion: readCurrentDoctorVersion(),
    nodeVersion: REPOSITORY_POLICY.runtime.node.setupVersion,
  };
}

/*** Return owner-managed artifact paths whose current bytes differ from policy output. */
async function getOutdatedPathsAsync(
  targetDirectory: string,
  definitions: readonly ManagedDefinition[],
): Promise<string[]> {
  const results = await Promise.all(
    definitions.map(async ({ contents, relativePath }) => {
      const current = await readFile(resolve(targetDirectory, relativePath), 'utf8').catch(
        (error: unknown) => {
          if (isNodeError(error) && error.code === 'ENOENT') return null;
          throw error;
        },
      );
      return current === contents ? null : relativePath;
    }),
  );
  return results.filter((relativePath): relativePath is string => relativePath !== null);
}

/*** Narrow an unknown error to a Node error carrying an error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/*** Narrow an unknown JSON-like value to a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Synchronize or validate the target Bun lockfile through Bun itself. */
async function runBunLockfileAsync(
  operation: OwnerSyncOperation,
  targetDirectory: string,
): Promise<void> {
  const args = [
    'install',
    '--cwd',
    targetDirectory,
    '--ignore-scripts',
    '--lockfile-only',
    '--registry=https://registry.npmjs.org',
  ];
  if (operation === 'status') args.push('--frozen-lockfile');

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('bun', args, { stdio: 'inherit' });
    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) return resolvePromise();
      rejectPromise(new Error(`Bun lockfile ${operation} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

/*** Serialize a package manifest using repository formatting. */
function serializePackageManifest(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/*** Write changed owner-managed artifacts while preserving byte-identical files. */
async function syncDefinitionsAsync(
  targetDirectory: string,
  definitions: readonly ManagedDefinition[],
): Promise<void> {
  for (const { contents, relativePath } of definitions) {
    const targetPath = resolve(targetDirectory, relativePath);
    const current = await readFile(targetPath, 'utf8').catch((error: unknown) => {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    });
    if (current === contents) continue;
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, 'utf8');
  }
}

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { applyBunRuntimePolicy } from '../policy/applyBunRuntimePolicy.js';
import { nodeRuntimePolicy } from '../policy/bunRuntimePolicy.js';
import { renderRenovateWorkflowAsync } from '../tools/workflows/renderRenovateWorkflowAsync.js';
import { renderWorkflowAsync } from '../tools/workflows/renderWorkflowAsync.js';

export async function synchronizeRenovateOwnerAsync(
  operation: OwnerSyncOperation,
  targetDirectory: string,
  options: OwnerSyncOptions = {},
): Promise<void> {
  const target = resolve(targetDirectory);
  const policy = await readTargetBunPolicyAsync(target);
  const definitions = await createManagedDefinitionsAsync(target, policy);
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

interface BunPolicy {
  readonly packageManager: string;
  readonly typesRange: string;
  readonly version: string;
}

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

async function assertDevtoolsTargetAsync(targetDirectory: string): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve(targetDirectory, 'package.json'), 'utf8'),
  ) as unknown;
  if (!isRecord(manifest) || manifest.name !== '@ankhorage/devtools') {
    throw new Error('The Renovate owner sync target must be @ankhorage/devtools.');
  }
}

async function createManagedDefinitionsAsync(
  targetDirectory: string,
  policy: BunPolicy,
): Promise<readonly ManagedDefinition[]> {
  const manifest = JSON.parse(
    await readFile(resolve(targetDirectory, 'package.json'), 'utf8'),
  ) as unknown;
  if (!isRecord(manifest)) {
    throw new Error('Devtools package.json must contain a JSON object.');
  }

  const readme = await readFile(resolve(targetDirectory, 'README.md'), 'utf8');
  const workflowPolicy = {
    bunVersion: policy.version,
    nodeVersion: nodeRuntimePolicy.setupVersion,
  };

  return [
    {
      relativePath: 'package.json',
      contents: serializePackageManifest(applyBunRuntimePolicy(manifest, policy)),
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
      contents: replaceReadmePolicy(readme, policy),
    },
  ];
}

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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readTargetBunPolicyAsync(targetDirectory: string): Promise<BunPolicy> {
  const contents = await readFile(
    resolve(targetDirectory, 'src/policy/bunRuntimePolicy.ts'),
    'utf8',
  );
  const matches = [...contents.matchAll(BUN_VERSION_PATTERN)];
  const version = matches.length === 1 ? matches[0]?.[1] : undefined;
  if (version === undefined) {
    throw new Error('Expected exactly one canonical BUN_VERSION literal in the target policy.');
  }
  const typesMatches = [...contents.matchAll(BUN_TYPES_VERSION_PATTERN)];
  const typesVersion = typesMatches.length === 1 ? typesMatches[0]?.[1] : undefined;
  if (typesVersion === undefined) {
    throw new Error(
      'Expected exactly one canonical BUN_TYPES_VERSION literal in the target policy.',
    );
  }

  return {
    packageManager: `bun@${version}`,
    typesRange: `^${typesVersion}`,
    version,
  };
}

function replaceReadmePolicy(readme: string, policy: BunPolicy): string {
  const startIndex = readme.indexOf(README_POLICY_START);
  const endIndex = readme.indexOf(README_POLICY_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('README.md must contain one ordered Devtools Bun policy marker pair.');
  }
  if (
    readme.includes(README_POLICY_START, startIndex + README_POLICY_START.length) ||
    readme.includes(README_POLICY_END, endIndex + README_POLICY_END.length)
  ) {
    throw new Error('README.md must contain exactly one Devtools Bun policy marker pair.');
  }

  const replacement = `${README_POLICY_START}\n\n${renderReadmePolicy(policy)}\n\n${README_POLICY_END}`;
  return `${readme.slice(0, startIndex)}${replacement}${readme.slice(
    endIndex + README_POLICY_END.length,
  )}`;
}

function renderReadmePolicy(policy: BunPolicy): string {
  return `\`\`\`text
Bun runtime       ${policy.version}
packageManager    ${policy.packageManager}
@types/bun        ${policy.typesRange}
\`\`\``;
}

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

function serializePackageManifest(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

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

const BUN_VERSION_PATTERN = /const BUN_VERSION = '(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)';/gu;
const BUN_TYPES_VERSION_PATTERN =
  /const BUN_TYPES_VERSION = '(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)';/gu;
const README_POLICY_END = '<!-- devtools-bun-policy:end -->';
const README_POLICY_START = '<!-- devtools-bun-policy:start -->';

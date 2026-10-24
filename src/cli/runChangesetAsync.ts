import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getDevtoolsToolCommand } from './commands.js';
import type { DevtoolsRunResult } from './runExternalTool.js';
import { runExternalTool } from './runExternalTool.js';

const execFileAsync = promisify(execFile);

interface RunChangesetDependencies {
  readonly readCurrentPackageManifestAsync: () => Promise<string>;
  readonly readGitFileAsync: (baseReference: string) => Promise<string>;
  readonly runExternalToolAsync: (argv: readonly string[]) => Promise<DevtoolsRunResult>;
}

const defaultRunChangesetDependencies: RunChangesetDependencies = {
  readCurrentPackageManifestAsync: async () => await readFile('package.json', 'utf8'),
  readGitFileAsync,
  runExternalToolAsync: async (argv) =>
    await runExternalTool(getDevtoolsToolCommand('changeset'), argv),
};

/*** Run Changesets with rename-aware status validation for a renamed root package. */
export async function runChangesetAsync(
  argv: readonly string[],
  dependencies: RunChangesetDependencies = defaultRunChangesetDependencies,
): Promise<DevtoolsRunResult> {
  const invocation = await resolveChangesetInvocationAsync(argv, dependencies);
  if (invocation.renamedPackageName === undefined) {
    return await dependencies.runExternalToolAsync(invocation.argv);
  }

  return await runRenamedPackageStatusAsync(
    { argv: invocation.argv, renamedPackageName: invocation.renamedPackageName },
    dependencies,
  );
}

/*** Omit the base comparison only when it compares a renamed root package identity. */
async function resolveChangesetInvocationAsync(
  argv: readonly string[],
  dependencies: RunChangesetDependencies,
): Promise<{ readonly argv: readonly string[]; readonly renamedPackageName?: string }> {
  const baseReference = getStatusBaseReference(argv);
  if (baseReference === undefined) return { argv };

  const packageNames = await readPackageNamesAsync(baseReference, dependencies);
  if (packageNames === undefined || packageNames.current === packageNames.base) return { argv };

  return {
    argv: removeStatusBaseReference(argv),
    renamedPackageName: packageNames.current,
  };
}

/*** Run renamed-package status with a release-plan check for the current identity. */
async function runRenamedPackageStatusAsync(
  invocation: { readonly argv: readonly string[]; readonly renamedPackageName: string },
  dependencies: RunChangesetDependencies,
): Promise<DevtoolsRunResult> {
  const directory = await mkdtemp(join(tmpdir(), 'ankhorage-changeset-status-'));
  const outputPath = join(directory, 'status.json');

  try {
    const result = await dependencies.runExternalToolAsync([
      ...withoutStatusOutput(invocation.argv),
      '--output',
      outputPath,
    ]);
    if (result.exitCode !== 0) return result;

    const releasePlan = JSON.parse(await readFile(outputPath, 'utf8')) as unknown;
    if (hasReleaseForPackage(releasePlan, invocation.renamedPackageName)) return result;

    console.error(
      `Changesets did not declare release intent for renamed package ${invocation.renamedPackageName}.`,
    );
    return { exitCode: 1 };
  } catch (error) {
    console.error(`Failed to validate renamed package Changeset: ${getErrorMessage(error)}`);
    return { exitCode: 1 };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

/*** Read the package identities being compared by a Changesets status command. */
async function readPackageNamesAsync(
  baseReference: string,
  dependencies: RunChangesetDependencies,
): Promise<{ readonly base: string; readonly current: string } | undefined> {
  try {
    const current = readPackageName(await dependencies.readCurrentPackageManifestAsync());
    const base = readPackageName(await dependencies.readGitFileAsync(baseReference));
    return { base, current };
  } catch {
    return undefined;
  }
}

/*** Read one package name from a package manifest. */
function readPackageName(contents: string): string {
  const manifest = JSON.parse(contents) as unknown;
  if (!isRecord(manifest) || typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error('package.json must declare a package name.');
  }
  return manifest.name;
}

/*** Read the base revision package manifest through Git. */
async function readGitFileAsync(baseReference: string): Promise<string> {
  const result = await execFileAsync('git', ['show', `${baseReference}:package.json`]);
  return result.stdout;
}

/*** Return the comparison ref from a Changesets status invocation. */
function getStatusBaseReference(argv: readonly string[]): string | undefined {
  if (argv[0] !== 'status') return undefined;

  const inlineReference = argv.find((argument) => argument.startsWith('--since='));
  if (inlineReference !== undefined) return inlineReference.slice('--since='.length);

  const sinceIndex = argv.indexOf('--since');
  return sinceIndex === -1 ? undefined : argv[sinceIndex + 1];
}

/*** Remove the base comparison arguments after verifying the root package identity changed. */
function removeStatusBaseReference(argv: readonly string[]): readonly string[] {
  return argv.filter(
    (argument, index) =>
      !argument.startsWith('--since=') && argument !== '--since' && argv[index - 1] !== '--since',
  );
}

/*** Remove user output arguments before reserving the status-plan output path. */
function withoutStatusOutput(argv: readonly string[]): readonly string[] {
  return argv.filter(
    (argument, index) =>
      !argument.startsWith('--output=') &&
      argument !== '--output' &&
      argv[index - 1] !== '--output',
  );
}

/*** Confirm that Changesets planned a release for the current renamed root package. */
function hasReleaseForPackage(value: unknown, packageName: string): boolean {
  if (!isRecord(value) || !Array.isArray(value.releases)) return false;

  return value.releases.some((release) => isRecord(release) && release.name === packageName);
}

/*** Render an unknown error as a deterministic diagnostic. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/*** Narrow an unknown JSON value to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

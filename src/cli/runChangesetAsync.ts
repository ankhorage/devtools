import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { getDevtoolsToolCommand } from './commands.js';
import type { DevtoolsRunResult } from './runExternalTool.js';
import { runExternalTool } from './runExternalTool.js';

const execFileAsync = promisify(execFile);

/*** Run Changesets with rename-aware status validation for a renamed root package. */
export async function runChangesetAsync(argv: readonly string[]): Promise<DevtoolsRunResult> {
  return await runExternalTool(
    getDevtoolsToolCommand('changeset'),
    await resolveChangesetArgumentsAsync(argv),
  );
}

/*** Omit the base comparison only when it compares a renamed root package identity. */
async function resolveChangesetArgumentsAsync(argv: readonly string[]): Promise<readonly string[]> {
  const baseReference = getStatusBaseReference(argv);
  if (baseReference === undefined) return argv;

  const packageNames = await readPackageNamesAsync(baseReference);
  if (packageNames === undefined || packageNames.current === packageNames.base) return argv;

  return removeStatusBaseReference(argv);
}

/*** Read the package identities being compared by a Changesets status command. */
async function readPackageNamesAsync(
  baseReference: string,
): Promise<{ readonly base: string; readonly current: string } | undefined> {
  try {
    const current = readPackageName(await readFile('package.json', 'utf8'));
    const base = await readGitFileAsync(baseReference);
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

/*** Narrow an unknown JSON value to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
